package com.studynow.docservice.dto;

import java.util.List;

public class ExtractionResponse {
    private String fileName;
    private String documentType; // "pdf" | "pptx"
    private List<ExtractedPage> pages;
    private List<ExtractedImage> images;
    private int pageCount;
    private int imageCount;

    public ExtractionResponse() {}

    public ExtractionResponse(String fileName, String documentType, List<ExtractedPage> pages, List<ExtractedImage> images) {
        this.fileName = fileName;
        this.documentType = documentType;
        this.pages = pages;
        this.images = images;
        this.pageCount = pages == null ? 0 : pages.size();
        this.imageCount = images == null ? 0 : images.size();
    }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }

    public List<ExtractedPage> getPages() { return pages; }
    public void setPages(List<ExtractedPage> pages) { this.pages = pages; }

    public List<ExtractedImage> getImages() { return images; }
    public void setImages(List<ExtractedImage> images) { this.images = images; }

    public int getPageCount() { return pageCount; }
    public void setPageCount(int pageCount) { this.pageCount = pageCount; }

    public int getImageCount() { return imageCount; }
    public void setImageCount(int imageCount) { this.imageCount = imageCount; }
}
