// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

import {
  createItemArray,
  createIiifCollectionJson,
} from "./helpers.js";

const directusEndpoint = process.env.PUBLIC_URL;
/*
const createIiifSingleImageJson = (fileId, height, width) => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${directusEndpoint}/iiif/manifest/file/${fileId}`,
  type: 'Manifest',
  label: {
    en: ['Image']
  },
  rights: 'http://creativecommons.org/licenses/by/4.0/',
  items: [
    {
      id: `${directusEndpoint}/iiif/canvas/1`,
      type: 'Canvas',
      height,
      width,
      items: [
        {
          id: `${directusEndpoint}/iiif/image/page/1`,
          type: 'AnnotationPage',
          items: [
            {
              id: `${directusEndpoint}/iiif/image/1`,
              type: 'Annotation',
              motivation: 'painting',
              body: {
                id: `${directusAssets}${fileId}?format=jpg`,
                type: 'Image',
                format: 'image/jpeg',
                height,
                width
              },
              target: `${directusEndpoint}/iiif/canvas/1`
            }
          ]
        }
      ]
    }
  ]
})
*/

export default {
  id: "iiif",
  handler: (router, { services, exceptions }) => {
    const { ItemsService } = services;
    // const { ServiceUnavailableException } = exceptions

    router.get("/", (req, res) => res.send("IIIF"));
    /* router.get("/manifest/file/:file_id", function (req, res, next) {
      const fileService = new ItemsService("directus_files", {
        schema: req.schema,
        accountability: req.accountability,
      });
      const fileId = req.params.file_id;
      fileService
        .readOne(fileId, { fields: ["width", "height"] })
        .then((results) =>
          res.send(
            createIiifSingleImageJson(fileId, results.height, results.width)
          )
        )
        .catch((error) => {
          return next(new ServiceUnavailableException(error.message));
        });
    }); */
    router.get(
      "/manifest/:collection/:file_id",
      async function (req, res, next) {
        const fileId = req.params.file_id;
        const collection = req.params.collection;
        const itemServiceSetting = new ItemsService("IIIF_settings", {
          schema: req.schema,
          accountability: req.accountability,
        });
        const itemServiceCollection = new ItemsService(collection, {
          schema: req.schema,
          accountability: req.accountability,
        });
        const itemServiceFiles = new ItemsService("directus_files", {
          schema: req.schema,
          accountability: req.accountability,
        });

        const fieldSettings = await itemServiceSetting.readByQuery({
          filter: { iiif_collection: { _eq: collection } },
        });
        const {
          iiif_file,
          iiif_canvas_label,
          iiif_meta,
          annotation_files,
          alto_files,
          txt_files,
        } = fieldSettings[0];

        const collectionDataFields = [
          `${iiif_file}.*`,
          iiif_canvas_label,
          `${annotation_files}.*`,
          `${alto_files}.*`,
          `${txt_files}.*`,
        ];

        // let's add fields from the user defined configuration
        iiif_meta.map((item) => collectionDataFields.push(`${item.Value}`));
        const collectionData = await itemServiceCollection.readOne(fileId, {
          fields: collectionDataFields,
          limit: -1,
          deep: {
            [iiif_file]: {
              _limit: -1,
            },
            [annotation_files]: {
              _limit: -1,
            },
            [txt_files]: {
              _limit: -1,
            },
            [alto_files]: {
              _limit: -1,
            },
          },
        });
        const imageArray = collectionData[iiif_file];
        const annotationArray = collectionData[`${annotation_files}`];
        const txtArray = collectionData[`${txt_files}`];
        const altoArray = collectionData[`${alto_files}`];
        const canvasLabel = collectionData[iiif_canvas_label];
        const imageDataArray = [];
        const annotationDataArray = [];
        const altoDataArray = [];
        const txtDataArray = [];

        await Promise.all(
          imageArray.map(async (item) => {
            const imageData = await itemServiceFiles.readOne(
              item.directus_files_id,
              {
                fields: [
                  "id",
                  "width",
                  "height",
                  "title",
                  "filename_download",
                  "author",
                  "date",
                ],
              }
            );
            imageDataArray.push(imageData);
          })
        );

        let annotation_sorted = [];
        if (typeof annotationArray !== "undefined") {
          await Promise.all(
            annotationArray.map(async (item) => {
              const annotationData = await itemServiceFiles.readOne(
                item.directus_files_id,
                {
                  fields: ["id", "title", "filename_download"],
                }
              );
              annotationDataArray.push(annotationData);
            })
          );
          annotation_sorted = annotationDataArray.sort((a, b) =>
            a.title > b.title ? 1 : -1
          );
        }

        let txt_files_sorted = [];
        if (typeof txtArray !== "undefined") {
          await Promise.all(
            txtArray.map(async (item) => {
              const txtData = await itemServiceFiles.readOne(
                item.directus_files_id,
                {
                  fields: ["id", "title", "filename_download"],
                }
              );
              txtDataArray.push(txtData);
            })
          );
          txt_files_sorted = txtDataArray.sort((a, b) =>
            a.title > b.title ? 1 : -1
          );
        }

        let alto_sorted = [];
        if (typeof altoArray !== "undefined") {
          await Promise.all(
            altoArray.map(async (item) => {
              const altoData = await itemServiceFiles.readOne(
                item.directus_files_id,
                {
                  fields: ["id", "title", "filename_download"],
                }
              );
              altoDataArray.push(altoData);
            })
          );
          alto_sorted = altoDataArray.sort((a, b) =>
            a.title > b.title ? 1 : -1
          );
        }

        const iiifMetaItems = iiif_meta.map((item) => {
          const iiifMetaArray = [];
          iiifMetaArray.push(`${item.Key}`, collectionData[`${item.Value}`]);
          return iiifMetaArray;
        });
        const image_sorted = imageDataArray.sort((a, b) =>
          a.title > b.title ? 1 : -1
        );

        const items = createItemArray(image_sorted, annotation_sorted, directusEndpoint);
        const hasAnnotations = annotation_sorted.length > 0;

        res.send(
          createIiifCollectionJson(
            canvasLabel,
            items,
            collection,
            fileId,
            iiifMetaItems,
            true, // sorted
            hasAnnotations,
            directusEndpoint
          )
        );
      }
    );
  },
};
