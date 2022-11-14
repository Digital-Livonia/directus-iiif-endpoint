
// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

//DOCS
// https://docs.directus.io/extensions/endpoints.html
// https://docs.directus.io/extensions/creating-extensions.html
const axios = require('axios');
const createIifJson = (fileId, height, width) => (
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
          id: "https://db.dl.tlu.ee/iiif/canvas",
          type: "Canvas",
          height: `${height}`,//replace with real values
          width: `${width}`,//replace with real values
          items: [
            {
              id: "https://db.dl.tlu.ee/iiif/image/page",
              type: "AnnotationPage",
              items: [
                {
                  id: "https://db.dl.tlu.ee/iiif/image",
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
                      "https://db.dl.tlu.ee/iiif/canvas",
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
  handler: (router) => {
    router.get("/", (req, res) => res.send("IIIF"));
      router.get('/manifest/file/:file_id/:file_height/:file_width', function(req, res) {
        const fileId = req.params.file_id;
        const fileHeight = req.params.file_height;
        const fileWidth = req.params.file_width
        res.send(createIifJson(fileId, fileHeight, fileWidth));
      });
  },
};



