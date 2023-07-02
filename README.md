# Bulk Exporter plugin

This is a plugin for Obsidian (https://obsidian.md).

# What it does

Output and restructure your notes based on metadata!

Simply:

![mspaint](assets/explain.png)

Uses the powerful [Obsidian Dataview plugin's](https://github.com/blacksmithgu/obsidian-dataview) language to find the files you want to export.

Shows the latest exported file status in the sidebar.

![](assets/sidebar.png)

### Output File Path and Name

It's a standard JS string literal, that gets the file metadata and some extras into it's context. The following is an example:

If file metadata is like this:
```js
{
  blog: 'diary',
  publishDate: '...'
  title: 'Another day at the office',
  tags: ['running', 'some']
}
```

it will be extended with the following:

```js
{
  created: {
    // moment style object with keys:
    YYYY: '2023',
    MM: '05',
    ...
    date: '2023-05-14',
    time: '17-54'
  },
  modified { ... } // date like above

  // if there is a slug property set, uses that, if there is not, falls back to the normalized
  // version of the title property, if again not present, falls back to the normalized version of the file name.
  slug: 'another-day-at-the-office'

  d: function (dateLikeParam){
    // Use it like this: ${d(someDateMetaData).date} // will return the date value parsed and reformatted.
   }
   norm: function(string){
    // Will remove any special characters from the string and replaces spaces and separators with dash (-) so it's url safe.
   }
}
```
... so you can use these to create whatever format you'd like.

#### Some Examples:

Want separate folders for different blogs?

`${blog}/${created.date}-${slug}`

Want to group different years into different folders?

`${blog}/${created.YYYY}/${created.MM}-${created.DD}-${slug}`

Want to keep the original filename and just dump everything in a flat structure?

`${fileName}`

Use a custom metadata field as formatted date in the source:

`${blog}/${d(date_published).date}-${slug}`

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/bulk-exporter/`.


### Thanks

Thanks to [jspaint.app](https://jspaint.app/) for this amazing service.

And of course shout out for the Obsidian people for this amazing tool!
