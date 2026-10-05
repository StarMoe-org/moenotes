# Browser recognition runtime

This directory holds the card box's screenshot-recognition Worker and its modules. The Worker reads the gallery, ONNX Runtime and the recognition models from the recognition site's content-addressed bundle and checks each file's size and SHA-256 before use (see `docs/card-box.md`).

ONNX Runtime 1.30.0 uses the [MIT license](licenses/onnxruntime-1.30.0-LICENSE.txt) and its [third-party notices](licenses/onnxruntime-1.30.0-ThirdPartyNotices.txt). The BoxLens recognition model weights include their [MIT license](licenses/boxlens-weights-LICENSE.txt). These software licenses do not grant ownership of the game's artwork.
