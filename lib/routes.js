function getRoutes(stack, prefix = "") {
  const routes = [];

  stack.forEach((layer) => {
    if (layer.route) {
      const path = prefix + layer.route.path;
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      routes.push({ path, methods });
    } else if (layer.name === "router" && layer.handle.stack) {
      routes.push(
        ...getRoutes(
          layer.handle.stack,
          prefix +
            (layer.regexp.source.replace("^\\/", "").replace("\\/?(?=\\/|$)", "") || "")
        )
      );
    }
  });

  return routes;
}

module.exports = getRoutes;