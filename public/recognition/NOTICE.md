# Browser recognition runtime

This directory holds the card box's screenshot-recognition Worker and its modules. The Worker reads the gallery, OpenCV, ONNX Runtime and the field model from the recognition site's content-addressed bundle and checks each file's size and SHA-256 before use (see `docs/card-box.md`).

OpenCV 5.0.0 uses the [Apache 2.0 license](licenses/opencv-5.0.0-LICENSE.txt), with the [FLANN BSD notice](licenses/flann-BSD-NOTICE.txt). ONNX Runtime 1.30.0 uses the [MIT license](licenses/onnxruntime-1.30.0-LICENSE.txt) and its [third-party notices](licenses/onnxruntime-1.30.0-ThirdPartyNotices.txt). The BoxLens field-reader weights include their [MIT license](licenses/boxlens-weights-LICENSE.txt). These software licenses do not grant ownership of the game's artwork.
