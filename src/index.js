// sisse tulev väärtus on faili ID
// selle järgi pärida faili mõõtmed directus_files tabelist ning asendada height ja width väärtused
// kas api väljund cachetakse kuidagi? tegelit poleks vaja ju uusi päringuid teha alati ...

export default {
  id: "iiif",
  handler: (router) => {
    let jsonObject = {
      "@context": "http://iiif.io/api/presentation/3/context.json",
      id: "https://db.dl.tlu.ee/iiif/manifest/file/file_id", //replace <file_id> with the real value 
      type: "Manifest",
      label: {
        en: ["Image"],
      },
      rights: "http://creativecommons.org/licenses/by/4.0/",
      items: [
        {
          id: "https://db.dl.tlu.ee/iiif/canvas",
          type: "Canvas",
          height: 1800,//replace with real values
          width: 1200,//replace with real values
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
                    id: "https://db.dl.tlu.ee/assets/f1667609-2d01-4c5d-98ef-7e4f3127664d?format=jpg", //replace file ID with the real value and lets make sure it is JPG by using format=jpg
                    type: "Image",
                    format: "image/jpeg",
                    height: 1800, //replace with real values
                    width: 1200,//replace with real values
                  },
                  target:
                    "https://db.dl.tlu.ee/iiif/canvas",
                },
              ],
            },
          ],
        },
      ],
    };
    router.get("/", (req, res) => res.send("IIIF"));
    router.get("/manifest/file/file_id", (req, res) => res.send(jsonObject));
  },
};
