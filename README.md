# Directus IIIF endpoint

This is work in progress. Currently extension extension adds [IIIF presentation API](https://iiif.io/api/presentation/3.0/) support to Directus media files.

## URL structure
- example.org/iiif/manifest/file/<directus-UUID> - returnes simple presentation API 
- example.org/iiif/manifest/:collection/:id - returns the collection item
## Requirements
- Currently extension relies on IIIF_settings table where configuration for collections is set
## Updating
- There is no automatic deployment set up
- To update the code
  - build it locally `npm run build`
  - run `package` script so that `dist` folder is created
  - upload the content of `dist` folder to S3 storage via https://console.s3.hpc.ut.ee/ into the folder `extensions`
  - delete previous version of the folder
  - restart directus instance `kubectl rollout restart deployment/dl-directus-deployment -n dl-tlu-ee`
## TODO 
- Document IIIF_settings table
- Auto generate IIIF_settings table during installations

There has been some discussion about the IIIF support for Directus: https://github.com/directus/directus/discussions/15495

## Versions
### 1.0.5
- IIIF content search support for items with annotations
### 1.0.4
- Image Download link added via `rendering` property
### 1.0.3
- Annotations support
### 1.0.2
- Thumbnail url and size update
### 1.0.1
- Support for asset author

