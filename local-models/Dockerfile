# Container image for the local-model inference Lambda.
#
# scikit-learn + scipy + numpy are far too large for a Lambda zip layer, so the
# model is served from a container image (AWS base image for Python). Training
# runs offline; this image only does inference (predict.py / lambda_handler.py)
# and loads per-user model bundles from S3.
#
# The build context is the local-models/ directory (not the repo root), so the
# image only ships this package — see the CDK stack's fromImageAsset and the
# scoped .dockerignore. From local-models/:
#   docker build -t bearlymail-local-model .
FROM public.ecr.aws/lambda/python:3.12

# Install only the inference dependencies (no training-only extras). Pinned to
# match the versions a bundle was trained under — a joblib bundle pickled under
# one scikit-learn version can fail to load under another.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Inference code. Training modules (trainer/relabel) are not needed at serve
# time but are small and harmless; copying the package keeps imports simple.
COPY *.py ./

# lambda_handler.handler is the entry point (see lambda_handler.py).
CMD ["lambda_handler.handler"]
