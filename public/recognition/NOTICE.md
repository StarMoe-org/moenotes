# Browser recognition runtime

Each content-addressed directory here holds the browser screenshot-recognition runtime used by the card box; its `bundle-manifest.json` lists every file with its size and SHA-256. The gallery covers 63 Member and 64 Snap cards from a fixed JP Master version. Card artwork is not part of the bundle: the Worker reads it from the asset service and checks it against the gallery manifest.

OpenCV 5.0.0 uses the [Apache 2.0 license](licenses/opencv-5.0.0-LICENSE.txt), with the [FLANN BSD notice](licenses/flann-BSD-NOTICE.txt). ONNX Runtime 1.30.0 uses the [MIT license](licenses/onnxruntime-1.30.0-LICENSE.txt) and its [third-party notices](licenses/onnxruntime-1.30.0-ThirdPartyNotices.txt). The BoxLens field-reader weights include their [MIT license](licenses/boxlens-weights-LICENSE.txt). These software licenses do not grant ownership of the game's artwork.
