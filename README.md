# Directus IIIF endpoint

This is work in progress. Currently extension extension adds [IIIF presentation API](https://iiif.io/api/presentation/3.0/) support to Directus media files.

URL structure:
- example.org/iiif/manifest/file/<directus-UUID> - returnes simple presentation API 

Example presentaion API output: 
- https://db.dl.tlu.ee/iiif/manifest/file/file_id (this extenison)
- https://cms.rahvaroivad.ee/wp-json/iiif/manifest/4084 (WordPress extension)

There has been some discussion about the IIIF support for Directus: https://github.com/directus/directus/discussions/15495
