---
blog: test
index: "true"
internalLinks: "10"
links: "10"
---
# h1
I want to link [[post1]] and [anywhere subfolder find by title](post1), then [posts1/header image test](posts1/header-imaget-test)

The first link is NOT supported currently by the client!

I also want to link something that does [not yet exists](posts1/does-not-exist-yet). <<--- This should be NOT A LINK in the export.
## h2
Finally, I want to link stuff.
Obsidian URL:
[obsidian url to subfolder](obsidian://open?vault=bulk-export-test&file=posts1%2Fsubfolder%2Fembedded%20asset%20tests) <- exported
[simple absolute subfolder](posts1/subfolder/sub-note1x) <<--- This should be NOT A LINK in the export, only if toggle is
[find it by name](header-image-test) <- exported

This link does not exist, should be removed, unless "preserve non-existent": [[asdf asdf asdf]]
Wiki link to be preserved if "preserve not public" toggle is on: [[bla bla blah]]
Wiki link same as the above with title: [[bla bla blah|i am a title]]
Normal link with %20 spaces: [bla](posts1/bla%20bla%20blah)
Normal link with NORMAL spaces: [bla](posts1/bla bla blah)
Obsidian Link: [bla](obsidian://open?vault=bulk-export-test&file=posts1%2Fbla%20bla%20blah)


