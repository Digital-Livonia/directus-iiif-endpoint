// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

//DOCS
// https://docs.directus.io/extensions/endpoints.html
// https://docs.directus.io/extensions/creating-extensions.html

const createItemArray = (results) => {
  const items = results.map((item, index) => ({
    id: `https://db.dl.tlu.ee/iiif/canvas/${index + 1}`,
    type: "Canvas",
    height: `${item.height}`, //replace with real values
    width: `${item.width}`, //replace with real values
    items: [
      {
        id: `https://db.dl.tlu.ee/iiif/image/page/${index + 1}`,
        type: "AnnotationPage",
        items: [
          {
            id: `https://db.dl.tlu.ee/iiif/image/${index + 1}`,
            type: "Annotation",
            motivation: "painting",
            body: {
              id: `https://db.dl.tlu.ee/assets/${item.id}?format=jpg`, //replace file ID with the real value and lets make sure it is JPG by using format=jpg
              type: "Image",
              format: "image/jpeg",
              height: `${item.height}`, //replace with real values
              width: `${item.width}`, //replace with real values
            },
            target: `https://db.dl.tlu.ee/iiif/canvas/${index + 1}`,
          },
        ],
      },
    ],
  }));
  return items;
};
const createIiifCollectionJson = (
  canvasLabel,
  items,
  collection,
  fileId,
  iiifMeta
) => {
  
  const iiifMetaItems = iiifMeta.map((item) => ({
    label: [`${item[0]}`],
    value: [`${item[1]}`],
  }));

  return {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    id: `https://db.dl.tlu.ee/iiif/manifest/${collection}/${fileId}`,
    type: "Manifest",
    label: {
      et: [`${canvasLabel}`],
    },
    metadata: iiifMetaItems,
    items: items,
  };
};
const createIiifSingleImageJson = (fileId, height, width) => ({
  "@context": "http://iiif.io/api/presentation/3/context.json",
  id: `https://db.dl.tlu.ee/iiif/manifest/file/${fileId}`, //replace <file_id> with the real value
  type: "Manifest",
  label: {
    en: ["Image"],
  },
  rights: "http://creativecommons.org/licenses/by/4.0/",
  items: [
    {
      id: "https://db.dl.tlu.ee/iiif/canvas/1",
      type: "Canvas",
      height: `${height}`, //replace with real values
      width: `${width}`, //replace with real values
      items: [
        {
          id: "https://db.dl.tlu.ee/iiif/image/page/1",
          type: "AnnotationPage",
          items: [
            {
              id: "https://db.dl.tlu.ee/iiif/image/1",
              type: "Annotation",
              motivation: "painting",
              body: {
                id: `https://db.dl.tlu.ee/assets/${fileId}?format=jpg`, //replace file ID with the real value and lets make sure it is JPG by using format=jpg
                type: "Image",
                format: "image/jpeg",
                height: `${height}`, //replace with real values
                width: `${width}`, //replace with real values
              },
              target: "https://db.dl.tlu.ee/iiif/canvas/1",
            },
          ],
        },
      ],
    },
  ],
});

export default {
  id: "iiif",
  handler: (router, { services, exceptions }) => {
    const { ItemsService } = services;
    const { ServiceUnavailableException } = exceptions;

    router.get("/", (req, res) => res.send("IIIF"));
    router.get("/manifest/file/:file_id", function (req, res, next) {
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
    });
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
        const { iiif_file, iiif_canvas_label, iiif_meta } = fieldSettings[0];

        const collectionDataFields = [`${iiif_file}.*`, iiif_canvas_label];
        // let's add fields from the user defined configuration
        iiif_meta.map((item) => collectionDataFields.push(`${item.Value}`));
        const collectionData = await itemServiceCollection.readOne(fileId, {
          fields: collectionDataFields,
        });
        const imageArray = collectionData[iiif_file];
        const canvasLabel = collectionData[iiif_canvas_label];

        const imageDataArray = [];
        await Promise.all(
          imageArray.map(async (item) => {
            const imageData = await itemServiceFiles.readOne(
              item.directus_files_id,
              { fields: ["id", "width", "height"] }
            );
            imageDataArray.push(imageData);
          })
        );
        const items = createItemArray(imageDataArray);

        const iiifMetaItems = iiif_meta.map((item) => {
          const iiifMetaArray = [];
          iiifMetaArray.push(`${item.Key}`, collectionData[`${item.Value}`]);
          return iiifMetaArray;
        });
        console.log(iiifMetaItems, "iiifMetaItems");

        res.send(
          createIiifCollectionJson(
            canvasLabel,
            items,
            collection,
            fileId,
            iiifMetaItems
          )
        );
      }
    );
  },
};
