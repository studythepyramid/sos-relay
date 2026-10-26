<!-- serve as index page for the static side, and temporarilly also the index for the vps site -->


- [Technical Notes](/tecNotes/)
    Linux commands, Ubuntu server admin. AI and Agents.


- [Doors](/tecNotes/door/)
    Setup notes for agents: open a door for a user. English, plus Russian, Persian, and Chinese.

- [Argument](/argument/)
    A platform for good traditions of argument between intelligent users,
    anonymous user could leave comments there.

- Projects
    Construction list. One line per job.

    - ![Hand mesh, colored by region](assets/handmesh-small.png) [linput](/tecNotes/projects/hand.abstract.md): fingers as keys. Work sits in `~/dev/linput/hand`.

    - ![Vim editor](assets/vim-icon.png) vim / nvim plugins: editor tools. No public page yet.

    - English learning: speaking practice. The numbered voice samples above are the public part.

- [Leave a message](/publicMsg/)
    Text messages for review, with no account required.

- SOS map (preview): map/index.html

- [Church Building](/church/)
    Explore a stone chapel in 3D: orbit, pan, zoom, and look inside.


- [History Notes](/history_notes/)
    The builder of this site guesses that the humanities should be
    represented in 3 big catetories of knowledges:
    The human history, the Theologies and the Sciences and Technologies.
    So the history notes is many many notes made by the site builder,
    when he, who's login name is za, observed the long time spanning from 
    the possible Big Bang, or ancient time in the Parallel Universe to
    nowadays.
    

- [Shared files](/share/)
    Public downloads. The folder lives on the VPS outside the MkDocs build, so a site rebuild does not delete it.


```
nav:

  # about.md should be left along for user editing
  - Doors to the real Internet: doors.2026-09.md

  - ~/dev/media-scripts/voice/server.py is a Flask backend. 
    It listens on 127.0.0.1:5057 and serves the page in static/.

     The three buttons are Play/Pause, Rec/Rec-Stop and Rec-Play. 
     Recording uses pw-record plus the same ffmpeg filter chain as vrecord.sh, and playback uses mpv.

  - on vps to do the english speak lessons, failed.
  - Voice samples:
      - English: samples/tts-stt-en.md
      - Chinese: samples/tts-stt-cn.md
  - Guide:
      - TTS/STT (offline): guide/tts-stt.md
  - Notes:
      - Client-side TTS/STT design: notes/web-ttsstt.md
```

## Folders

- [guide/](guide/)
- [notes/](notes/)

## Files

- [about](about.md)
- [old.index](old.index.md)
