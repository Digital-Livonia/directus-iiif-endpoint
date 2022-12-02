// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

//DOCS
// https://docs.directus.io/extensions/endpoints.html
// https://docs.directus.io/extensions/creating-extensions.html

const createIiifCollectionJson = (results) => {
    const UUID = results.iiif_file;
    const canvasLabel = results.iiif_canvas_label;
    const collection = results.iiif_collection;
    const metaData = results.iiif_meta
    const metadataArray = metaData.map(item => ({
        "label": [
            item.Key
        ],
        "value": [
            item.Value
        ]
    }))
    return (
        {
            "@context": "http://iiif.io/api/presentation/3/context.json",
            "id": `https://cms.rahvaroivad.ee/wp-json/iiif/manifest/${UUID}`,
            "type": "Manifest",
            "label": {
                "et": [
                    `${canvasLabel}`
                ]
            },
            "items": [
                {
                    "type": "Canvas",
                    "id": "http://iip.archaeovision.eu/canvas/1",
                    "label": {
                        "et": [
                            `${canvasLabel}`
                        ]
                    },
                    "metadata": metadataArray
                }
            ]
        }
    )
}
const createIiifSingleImageJson = (fileId, height, width) => (
    {
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
                height: `${height}`,//replace with real values
                width: `${width}`,//replace with real values
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
                                    width: `${width}`,//replace with real values
                                },
                                target:
                                    "https://db.dl.tlu.ee/iiif/canvas/1",
                            },
                        ],
                    },
                ],
            },
            {
                id: "https://db.dl.tlu.ee/iiif/canvas/2",
                type: "Canvas",
                height: `${height}`,//replace with real values
                width: `${width}`,//replace with real values
                items: [
                    {
                        id: "https://db.dl.tlu.ee/iiif/image/page/2",
                        type: "AnnotationPage",
                        items: [
                            {
                                id: "https://db.dl.tlu.ee/iiif/image/2",
                                type: "Annotation",
                                motivation: "painting",
                                body: {
                                    id: `https://db.dl.tlu.ee/assets/${fileId}?format=jpg`, //replace file ID with the real value and lets make sure it is JPG by using format=jpg
                                    type: "Image",
                                    format: "image/jpeg",
                                    height: `${height}`, //replace with real values
                                    width: `${width}`,//replace with real values
                                },
                                target:
                                    "https://db.dl.tlu.ee/iiif/canvas/2",
                            },
                        ],
                    },
                ],
            },
        ],
    }
)

export default {
    id: "iiif",
    handler: (router, {services, exceptions}) => {
        const {ItemsService} = services;
        const {ServiceUnavailableException} = exceptions;

        router.get("/", (req, res) => res.send("IIIF"));
        router.get('/manifest/file/:file_id', function (req, res, next) {
            const fileService = new ItemsService('directus_files', {
                schema: req.schema,
                accountability: req.accountability
            });
            const fileId = req.params.file_id;
            fileService
                .readOne(fileId, {fields: ["width", "height"]})
                .then((results) => res.send(createIiifSingleImageJson(fileId, results.height, results.width)))
                .catch((error) => {
                    return next(new ServiceUnavailableException(error.message));
                });

        })
        router.get('/manifest/:collection/:file_id', function (req, res, next) {
            const fileId = req.params.file_id;
             const fileService = new ItemsService("IIIF_settings", {
                 schema: req.schema,
                 accountability: req.accountability
             });
             fileService
                 .readOne(fileId)
                 .then((results) => res.send(createIiifCollectionJson(results)))
                 .catch((error) => {
                     return next(new ServiceUnavailableException(error.message));
                 });

         })
    }
}
