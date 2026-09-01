package com.studynow.docservice.service;

import com.studynow.docservice.dto.ExtractedImage;
import com.studynow.docservice.dto.ExtractedPage;
import com.studynow.docservice.dto.ExtractionResponse;
import org.apache.poi.sl.usermodel.PictureData;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFPictureShape;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Service
public class PptxExtractionService {

    public ExtractionResponse extract(String fileName, byte[] fileBytes) throws Exception {
        List<ExtractedPage> pages = new ArrayList<>();
        List<ExtractedImage> images = new ArrayList<>();

        try (XMLSlideShow ppt = new XMLSlideShow(new ByteArrayInputStream(fileBytes))) {
            List<XSLFSlide> slides = ppt.getSlides();

            for (int slideIndex = 0; slideIndex < slides.size(); slideIndex++) {
                XSLFSlide slide = slides.get(slideIndex);
                int slideNumber = slideIndex + 1;
                String pageRef = "Slide " + slideNumber;

                StringBuilder text = new StringBuilder();
                int imageOrdinal = 0;

                for (XSLFShape shape : slide.getShapes()) {
                    if (shape instanceof XSLFTextShape textShape) {
                        String shapeText = textShape.getText();
                        if (shapeText != null && !shapeText.isBlank()) {
                            text.append(shapeText.trim()).append("\n");
                        }
                    } else if (shape instanceof XSLFPictureShape pictureShape) {
                        PictureData pictureData = pictureShape.getPictureData();
                        if (pictureData == null) continue;
                        imageOrdinal++;
                        // PictureData#getContentType() returns the MIME type directly (e.g. "image/png").
                        String contentType = pictureData.getContentType();
                        if (contentType == null || !contentType.startsWith("image/")) continue;
                        String extension = contentType.substring(contentType.indexOf('/') + 1);
                        String base64 = Base64.getEncoder().encodeToString(pictureData.getData());
                        images.add(new ExtractedImage(
                            pageRef,
                            "slide-" + slideNumber + "-" + imageOrdinal + "." + extension,
                            contentType,
                            base64
                        ));
                    }
                }

                pages.add(new ExtractedPage(pageRef, slideNumber, text.toString().trim()));
            }
        }

        return new ExtractionResponse(fileName, "pptx", pages, images);
    }
}
