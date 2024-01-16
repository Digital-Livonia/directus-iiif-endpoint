// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

const prepAuthor = (value) =>
  value
    ? [{ label: { et: ["Fotograaf"], en: ["Photpgrapher"] }, "value": value }]
    : "";
const createItemArray = (results) => {
  const items = results.map((item, index) => ({
    id: `https://db.dl.tlu.ee/iiif/canvas/${index + 1}`,
    all: `${item.title}`,
    filename: `${item.filename_download}`,
    type: "Canvas",
    height: `${item.height}`,
    width: `${item.width}`,
    metadata: prepAuthor(item.author),
    thumbnail: [
      {
        id: `https://db.dl.tlu.ee/assets/${item.id}?format=jpg`,
        type: "Image",
        format: "image/png",
        width: 640,
        height: 360
      }
    ],
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
              id: `https://db.dl.tlu.ee/assets/${item.id}?format=jpg`, //lets make sure it is JPG by using format=jpg
              type: "Image",
              format: "image/jpeg",
              height: `${item.height}`,
              width: `${item.width}`,
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
  iiifMeta,
  sorted
) => {
  const iiifMetaItems = iiifMeta.map((item) => ({
    label: [`${item[0]}`],
    value: [`${item[1]}`],
  }));

  return {
    "@context": "http://iiif.io/api/presentation/3/context.json",
    sorted: sorted,
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
  id: `https://db.dl.tlu.ee/iiif/manifest/file/${fileId}`,
  type: "Manifest",
  label: {
    en: ["Image"],
  },
  service: {
    id: "https://web.chgov.bar.admin.ch/iiif/search/manifest/32316311",
    profile: "http://iiif.io/api/search/1/search",
    type: "SearchService1"
  },
  rights: "http://creativecommons.org/licenses/by/4.0/",
  items: [
    {
      id: "https://db.dl.tlu.ee/iiif/canvas/1",
      type: "Canvas",
      height: `${height}`,
      width: `${width}`,
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
                id: `https://db.dl.tlu.ee/assets/${fileId}?format=jpg`, //lets make sure it is JPG by using format=jpg
                type: "Image",
                format: "image/jpeg",
                height: `${height}`,
                width: `${width}`,
              },
              target: "https://db.dl.tlu.ee/iiif/canvas/1",
            },
          ],
        },
      ],
      annotations: [
        {
          id: `https://db.dl.tlu.ee/iiif/manifest/file/${fileId}#annotations-content-supplementing-32316311-0`,
          type: "AnnotationPage",
          items: [
            {
              "@context": "http://iiif.io/api/presentation/3/context.json",
              id: `https://db.dl.tlu.ee/iiif/manifest/file/${fileId}#annotations-content-supplementing-32316311-0`,
              "type": "Annotation",
              "motivation": "supplementing",
              "target": "https://api.chgov.bar.admin.ch/manifests/32316311/canvasses/32316311-0",
              "body": {
                "id": "https://api.chgov.bar.admin.ch/ocr/32316311/hocr/32316311-0.hocr",
                "type": "Text",
                "format": "text/vnd.hocr+html"
              }
            }
          ]
        }
      ],
      seeAlso: [
        {
          id: "https://api.chgov.bar.admin.ch/ocr/32316311/hocr/32316311-0.hocr",
          type: "Text",
          format: "text/vnd.hocr+html",
          profile: "http://kba.cloud/hocr-spec/1.2/"
        }
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

        const iiifMetaItems = iiif_meta.map((item) => {
          const iiifMetaArray = [];
          iiifMetaArray.push(`${item.Key}`, collectionData[`${item.Value}`]);
          return iiifMetaArray;
        });
        const sorted = imageDataArray.sort((a, b) =>
          a.title > b.title ? 1 : -1
        );
        const items = createItemArray(sorted);

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
