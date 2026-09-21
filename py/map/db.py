"""Shared SQLite storage. The local test API does not check property restrictions.

The future public API must check the location restriction before calling create_pin.
Argument migrations can share this file without linking SOS pins to accounts.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
import math
from pathlib import Path
import sqlite3
from uuid import UUID, uuid4

DEFAULT_PATH = Path(__file__).resolve().parents[2] / 'var' / 'genone.db'


@contextmanager
def connect(path):
    db = sqlite3.connect(path, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def initialize(path=DEFAULT_PATH):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                component TEXT NOT NULL,
                version INTEGER NOT NULL,
                applied_at TEXT NOT NULL,
                PRIMARY KEY (component, version)
            );
            CREATE TABLE IF NOT EXISTS sos_pins (
                id TEXT PRIMARY KEY,
                latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
                longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
                message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 600),
                contact TEXT CHECK(contact IS NULL OR length(contact) <= 200),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sos_pins_viewport
                ON sos_pins(latitude, longitude);
        """)
        db.execute(
            "INSERT OR IGNORE INTO schema_migrations VALUES ('sos', 1, ?)",
            (datetime.now(timezone.utc).isoformat(),),
        )
        applied_v2 = db.execute(
            "SELECT 1 FROM schema_migrations WHERE component = 'sos' AND version = 2"
        ).fetchone()
        if not applied_v2:
            db.executescript("""
                ALTER TABLE sos_pins ADD COLUMN processed_at TEXT;
                CREATE INDEX IF NOT EXISTS sos_pins_unprocessed
                    ON sos_pins(processed_at) WHERE processed_at IS NULL;
                CREATE TABLE IF NOT EXISTS sos_pin_agent_results (
                    id TEXT PRIMARY KEY,
                    pin_id TEXT NOT NULL REFERENCES sos_pins(id),
                    kind TEXT NOT NULL,
                    result TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS sos_pin_agent_results_pin
                    ON sos_pin_agent_results(pin_id);
            """)
            db.execute(
                "INSERT OR IGNORE INTO schema_migrations VALUES ('sos', 2, ?)",
                (datetime.now(timezone.utc).isoformat(),),
            )


def coordinate(value, limit):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("Coordinates must be numbers")
    if not math.isfinite(value) or not -limit <= value <= limit:
        raise ValueError("Coordinate outside valid range")
    return value


def create_pin(path, *, latitude, longitude, message, share_contact=False, contact=None, pin_id=None):
    latitude = coordinate(latitude, 90)
    longitude = coordinate(longitude, 180)
    if not isinstance(message, str) or not 1 <= len(message.strip()) <= 600:
        raise ValueError("Message must contain 1–600 characters")
    if not isinstance(share_contact, bool):
        raise ValueError("Contact sharing must be a boolean")
    if share_contact and contact is not None:
        if not isinstance(contact, str) or len(contact) > 200:
            raise ValueError("Contact must contain at most 200 characters")
        contact = contact.strip() or None
    else:
        contact = None
    if pin_id is not None:
        if not isinstance(pin_id, str):
            raise ValueError('Invalid message ID')
        try:
            pin_id = str(UUID(pin_id))
        except ValueError:
            raise ValueError('Invalid message ID') from None
    pin = dict(id=pin_id or str(uuid4()), latitude=latitude, longitude=longitude,
               message=message.strip(), contact=contact,
               created_at=datetime.now(timezone.utc).isoformat())
    with connect(path) as db:
        db.execute("""INSERT OR IGNORE INTO sos_pins
            (id, latitude, longitude, message, contact, created_at)
            VALUES (:id, :latitude, :longitude, :message, :contact, :created_at)""", pin)
        stored = dict(db.execute('SELECT * FROM sos_pins WHERE id = ?', (pin['id'],)).fetchone())
        if any(stored[key] != pin[key] for key in ('latitude', 'longitude', 'message', 'contact')):
            raise ValueError('This message ID was already used for a different message')
    return stored


def fetch_unprocessed_pins(path, *, limit=20):
    """Pins the background agent hasn't produced a result for yet.

    processed_at IS NULL is the whole queue — no separate message broker.
    A pin only leaves this set via save_agent_result, so a failed/crashed
    processing attempt leaves it here for the next poll to retry.
    """
    with connect(path) as db:
        rows = db.execute(
            "SELECT * FROM sos_pins WHERE processed_at IS NULL ORDER BY created_at LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_agent_result(path, *, pin_id, kind, result):
    """Record one agent result and mark its pin processed, atomically.

    Only call this on success — process_once() never calls it for a pin
    whose processing raised, so that pin's processed_at stays NULL and it's
    picked up again on the next poll rather than silently dropped.
    """
    if not isinstance(result, str) or not result.strip():
        raise ValueError("Agent result must be non-empty text")
    now = datetime.now(timezone.utc).isoformat()
    with connect(path) as db:
        db.execute(
            "INSERT INTO sos_pin_agent_results (id, pin_id, kind, result, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (str(uuid4()), pin_id, kind, result.strip(), now),
        )
        db.execute("UPDATE sos_pins SET processed_at = ? WHERE id = ?", (now, pin_id))


def list_pins(path, *, south, west, north, east, limit=200, offset=0):
    south, north = coordinate(south, 90), coordinate(north, 90)
    west, east = coordinate(west, 180), coordinate(east, 180)
    if south > north:
        raise ValueError("South must not exceed north")
    if type(limit) is not int or not 1 <= limit <= 500:
        raise ValueError("Limit must be between 1 and 500")
    if type(offset) is not int or offset < 0:
        raise ValueError("Offset must be nonnegative")
    # A viewport crossing the antimeridian contains either longitude interval.
    clause = "longitude BETWEEN ? AND ?" if west <= east else "(longitude >= ? OR longitude <= ?)"
    with connect(path) as db:
        rows = db.execute(
            f"""SELECT * FROM sos_pins WHERE latitude BETWEEN ? AND ? AND {clause}
                ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
            (south, north, west, east, limit, offset),
        ).fetchall()
    return [dict(row) for row in rows]
