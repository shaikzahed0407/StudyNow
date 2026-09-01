package com.studynow.docservice.controller;

import com.studynow.docservice.dto.ExtractionResponse;
import com.studynow.docservice.service.PdfExtractionService;
import com.studynow.docservice.service.PptxExtractionService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * StudyNow document-extraction service.
 *
 * Stateless by design: it never touches Supabase, the database, or an LLM.
 * It only turns a PDF/PPTX file into plain text (per page/slide) and
 * base64-encoded images, and hands that back as JSON. The Node backend is
 * responsible for chunking the text, uploading the images to storage, and
 * calling the AI model — this service just does the parsing Apache
 * PDFBox/POI are genuinely better at than the JS equivalents.
 */
@RestController
@RequestMapping("/api")
public class ExtractionController {

    private final PdfExtractionService pdfExtractionService;
    private final PptxExtractionService pptxExtractionService;

    public ExtractionController(PdfExtractionService pdfExtractionService, PptxExtractionService pptxExtractionService) {
        this.pdfExtractionService = pdfExtractionService;
        this.pptxExtractionService = pptxExtractionService;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "studynow-doc-service");
    }

    @PostMapping(value = "/extract/pdf", consumes = "multipart/form-data")
    public ResponseEntity<ExtractionResponse> extractPdf(@RequestParam("file") MultipartFile file) {
        validate(file, "application/pdf");
        try {
            ExtractionResponse response = pdfExtractionService.extract(file.getOriginalFilename(), file.getBytes());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Failed to extract PDF: " + e.getMessage(), e);
        }
    }

    @PostMapping(value = "/extract/pptx", consumes = "multipart/form-data")
    public ResponseEntity<ExtractionResponse> extractPptx(@RequestParam("file") MultipartFile file) {
        validate(file, null);
        try {
            ExtractionResponse response = pptxExtractionService.extract(file.getOriginalFilename(), file.getBytes());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Failed to extract PPTX: " + e.getMessage(), e);
        }
    }

    private void validate(MultipartFile file, String expectedContentType) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No file uploaded");
        }
        if (file.getSize() > 25 * 1024 * 1024) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File exceeds 25MB limit");
        }
    }
}
