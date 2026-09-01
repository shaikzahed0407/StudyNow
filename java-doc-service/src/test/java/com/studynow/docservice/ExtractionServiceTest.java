package com.studynow.docservice;

import com.studynow.docservice.dto.ExtractionResponse;
import com.studynow.docservice.service.PdfExtractionService;
import com.studynow.docservice.service.PptxExtractionService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.apache.poi.xslf.usermodel.XSLFTextParagraph;
import org.apache.poi.xslf.usermodel.XSLFTextRun;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class ExtractionServiceTest {

    @Test
    void extractsTextAndRendersPagesFromARealPdf() throws Exception {
        byte[] pdfBytes = buildSimplePdf("BFS explores a graph level by level using a queue.");

        PdfExtractionService service = new PdfExtractionService();
        ExtractionResponse result = service.extract("bfs-notes.pdf", pdfBytes);

        assertEquals("pdf", result.getDocumentType());
        assertEquals(1, result.getPageCount());
        assertTrue(result.getPages().get(0).getText().contains("BFS explores a graph"));
        assertEquals("Page 1", result.getPages().get(0).getPageRef());

        // One page was rendered as a visual (used as "diagram evidence" fallback
        // even for text-only pages, matching the original Node behavior of
        // rendering the first few PDF pages).
        assertEquals(1, result.getImageCount());
        assertEquals("image/png", result.getImages().get(0).getContentType());
        assertFalse(result.getImages().get(0).getBase64Data().isBlank());
    }

    @Test
    void extractsPerSlideTextFromARealPptx() throws Exception {
        byte[] pptxBytes = buildSimplePptx("Depth-first search uses a stack or recursion.");

        PptxExtractionService service = new PptxExtractionService();
        ExtractionResponse result = service.extract("dfs-notes.pptx", pptxBytes);

        assertEquals("pptx", result.getDocumentType());
        assertEquals(1, result.getPageCount());
        assertEquals("Slide 1", result.getPages().get(0).getPageRef());
        assertTrue(result.getPages().get(0).getText().contains("Depth-first search"));
    }

    private byte[] buildSimplePdf(String text) throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(50, 700);
                stream.showText(text);
                stream.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    private byte[] buildSimplePptx(String text) throws Exception {
        try (XMLSlideShow ppt = new XMLSlideShow()) {
            XSLFSlide slide = ppt.createSlide();
            XSLFTextBox textBox = slide.createTextBox();
            textBox.setAnchor(new java.awt.Rectangle(50, 50, 400, 100));
            XSLFTextParagraph paragraph = textBox.addNewTextParagraph();
            XSLFTextRun run = paragraph.addNewTextRun();
            run.setText(text);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ppt.write(out);
            return out.toByteArray();
        }
    }
}
