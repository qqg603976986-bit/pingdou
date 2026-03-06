from PIL import Image
img = Image.open("./0.png").resize((256, 256))
small = img.resize((128, 128), resample=Image.BILINEAR)
result = small.resize(img.size, resample=Image.NEAREST)
#result.save("pixel_photo.png")
result.show()