Idioma português (OCR) — instalação opcional offline
====================================================

Por padrão o app baixa o idioma do CDN oficial:
https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best_int/

Para usar sem internet (após a 1ª configuração), baixe o arquivo e coloque nesta pasta:

  por.traineddata.gz

URL direta (jsDelivr):
https://cdn.jsdelivr.net/npm/@tesseract.js-data@1.0.0/por/4.0.0_best_int/por.traineddata.gz

O caminho final deve ser:
  public/tesseract/lang/por/4.0.0_best_int/por.traineddata.gz

Reinicie o servidor de desenvolvimento após copiar o arquivo.
