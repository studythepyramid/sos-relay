
To split the /my/history/2021/notebook.history.md
into  tmp/history/...

The source file has formats, 
it's use markdown "#, ##, ###" for titles.
So the level 1 split is accroding to title level 1.

level 2 split is to ensure no piece over 1000 lines.
we use another format in the source file,
it's date starts at beginning of a new line,
which has 4 digitals.  it's ^\d\d\d\d 

## Level 1 split

The results of splitting is put into: 
tmp/history_notes/

the level 1 split is 
tmp/history_notes/01_phrase.md
tmp/history_notes/02_phrase.md
......

the "phrase" is the first phrase in the title, 
after the leading markdown symbol #
only one phrase to keep it simple


## Level 2 split

If number of lines get over 1000, 
then we do the 2nd level split.
Chop the L1 file into 999 lines each,
name it with postfix of [a,b,c,d...]
such as  L1_name_a.md, L1_name_b.md ...




## Zatranslate block

append into each file with :ZaTranslateInit block


```
<!-- zatranslate
target = /home/za/dev/sos-relay/tmp/history_notes/name+en.md
from = cn
to = en
translate_whole = true
block_size = 300
-->
```

I have question whether we could use relative path for the "target"?


# Should we build a list of tasks?

Build the subdir name list, before the real splitting,
as:

```
...
5,
split-file-name: 05_150M...md
range: xxxx  # start - end line number
lines: end - start
translate-file-name: 05_150M...en.md

6,
...
```

Could this make the job easy to control?


# assemble vs dissamble

We need be able to reverse the spliting,
it's to merge the splitting to a new file.

merge  /tmp/test.merge.md
merge  --en  /tmp/test.merge.en.md


# build site and the content of it


