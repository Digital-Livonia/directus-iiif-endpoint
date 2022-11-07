export default (router, { services, exceptions }) => {
  const { ItemsService } = services;
  const { ServiceUnavailableException } = exceptions;

  router.get("/iiif", (req, res, next) => {
    const recipeService = new ItemsService("directus_files", {
      schema: req.schema,
      accountability: req.accountability,
    });

    recipeService
      .readByQuery({ sort: ["title"], fields: ["*"] })
      .then((results) => res.json(results))
      .catch((error) => {
        return next(new ServiceUnavailableException(error.message));
      });
  });

};
