let backendHandlerPromise = null;

module.exports = async (req, res) => {
  if (!backendHandlerPromise) {
    backendHandlerPromise = import('../backend/api/[...path].js').then((mod) => mod.default);
  }

  const backendHandler = await backendHandlerPromise;
  return backendHandler(req, res);
};
