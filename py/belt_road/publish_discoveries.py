"""Retired: the foreground crawler now writes map locations directly to its database.

Old databases are handled once by migrate.py. There is no publication command
in the current workflow; see README.md.
"""
if __name__ == '__main__':
    raise SystemExit('Publication is no longer required. Run crawl.py directly; see README.md.')
