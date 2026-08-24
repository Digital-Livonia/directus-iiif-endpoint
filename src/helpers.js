export function findIdByFile(annotations, filename_download) {
    console.log(filename_download, "filename_download");
    console.log(annotations, "annotations");
    const annotation = annotations.find(
        (annotation) => annotation.filename_download === filename_download
    );
    return annotation ? annotation.id : false;
}

export function getAnnotations(annotations, filename_download, directusEndpoint) {
    const directusAssets = `${directusEndpoint}/assets/`;
    const annoId = findIdByFile(annotations, filename_download);
    if (annoId) {
        return {
            id: `${directusAssets}${annoId}.json`,
            type: "AnnotationPage",
        };
    } else return null;
}

export const createItemArray = (results, annotations, directusEndpoint) => {
    const directusAssets = `${directusEndpoint}/assets/`;
    const thumbWidth = 100;
    return results.map((item, index) => {
        const filename_download = item.filename_download.split(".")[0] + ".json";
        const annotationData = getAnnotations(annotations, filename_download, directusEndpoint);

        const renderingItems = [
            {
                id: `${directusAssets}${item.id}?download=${item.filename_download}`,
                type: "Text",
                label: {
                    en: [
                        `Download original (${item.filename_download
                            .split(".")
                            .pop()
                            .toUpperCase()})`,
                    ],
                },
                format: item.type,
            },
        ];

        return {
            id: `${directusEndpoint}/iiif/canvas/${index + 1}`,
            label: {
                none: [`${index + 1}`],
            },
            filename: `${item.filename_download}`,
            type: "Canvas",
            height: item.height,
            width: item.width,
            thumbnail: [
                {
                    id: `${directusAssets}${item.id}?key=thumbnail`,
                    type: "Image",
                    format: "image/png",
                    width: thumbWidth,
                    height: Math.round((thumbWidth * item.height) / item.width),
                },
            ],
            items: [
                {
                    id: `${directusEndpoint}/iiif/image/page/${index + 1}`,
                    type: "AnnotationPage",
                    items: [
                        {
                            id: `${directusEndpoint}/iiif/image/${index + 1}`,
                            type: "Annotation",
                            motivation: "painting",
                            body: {
                                id: `${directusAssets}${item.id}?format=jpg`,
                                type: "Image",
                                format: "image/jpeg",
                                height: item.height,
                                width: item.width,
                            },
                            target: `${directusEndpoint}/iiif/canvas/${index + 1}`,
                        },
                    ],
                },
            ],
            ...(annotationData ? { annotations: [annotationData] } : {}),
            rendering: renderingItems,
        };
    });
};

export const createIiifCollectionJson = (
    canvasLabel,
    items,
    collection,
    fileId,
    iiifMeta,
    sorted,
    hasAnnotations = false,
    directusEndpoint
) => {
    const iiifMetaItems = iiifMeta.map((item) => ({
        label: { et: [`${item[0]}`] },
        value: { et: [`${item[1]}`] },
    }));

    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        sorted,
        id: `${directusEndpoint}/iiif/manifest/${collection}/${fileId}`,
        type: "Manifest",
        label: {
            et: [`${canvasLabel}`],
        },
        metadata: iiifMetaItems,
        items,
        ...(hasAnnotations
            ? {
                service: {
                    "@id": `https://dev.dl.tlu.ee/api/iiif/search`,
                    "@context": "http://iiif.io/api/search/1/context.json",
                    profile: "http://iiif.io/api/search/1/search",
                },
            }
            : {}),
    };
};
