# Directus IIIF endpoint

This is work in progress. Currently extension extension adds [IIIF presentation API](https://iiif.io/api/presentation/3.0/) support to Directus media files.

URL structure:
- example.org/iiif/manifest/file/<directus-UUID> - returnes simple presentation API 
- example.org/iiif/manifest/:collection/:id - returns the collection item

Requirements:
- Currently extension relies on IIIF_settings table where configuration for collections is set
  
TODO: 
- Document IIIF_settings table
- Auto generate IIIF_settings table during installations

There has been some discussion about the IIIF support for Directus: https://github.com/directus/directus/discussions/15495

## Versions
### 1.0.1
- Support for asset author and date added: <file_field>.directus_files_id.author, <file_field>.directus_files_id.date