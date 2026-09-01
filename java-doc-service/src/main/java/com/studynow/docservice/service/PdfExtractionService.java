package com.studynow.docservice.service;

import com.studynow.docservice.dto.ExtractedImage;
import com.studynow.docservice.dto.ExtractedPage;
import com.studynow.docservice.dto.ExtractionResponse;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Service
public class PdfExtractionService {

    // Rendering every page of a large PDF is expensive; cap it the same way
    // the original Node implementation did (first 6 pages as visual evidence).
    private static final int MAX_RENDERED_PAGES = 6;
    private static final float RENDER_DPI = 110f;

    public ExtractionResponse extract(String fileName, byte[] fileBytes) throws Exception {
        List<ExtractedPage> pages = new ArrayList<>();
        List<ExtractedImage> images = new ArrayList<>();

        try (PDDocument document = Loader.loadPDF(fileBytes)) {
            int totalPages = document.getNumberOfPages();

            PDFTextStripper stripper = new PDFTextStripper();
            for (int pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
                stripper.setStartPage(pageIndex);
                stripper.setEndPage(pageIndex);
                String text = stripper.getText(document).trim();
                pages.add(new ExtractedPage("Page " + pageIndex, pageIndex, text));
            }

            PDFRenderer renderer = new PDFRenderer(document);
            int renderCount = Math.min(totalPages, MAX_RENDERED_PAGES);
            for (int pageIndex = 0; pageIndex < renderCount; pageIndex++) {
                var bufferedImage = renderer.renderImageWithDPI(pageIndex, RENDER_DPI, ImageType.RGB);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                ImageIO.write(bufferedImage, "png", out);
                String base64 = Base64.getEncoder().encodeToString(out.toByteArray());
                images.add(new ExtractedImage(
                    "Page " + (pageIndex + 1),
                    "page-" + (pageIndex + 1) + ".png",
                    "image/png",
                    base64
                ));
            }
        }

        return new ExtractionResponse(fileName, "pdf", pages, images);
    }
}
