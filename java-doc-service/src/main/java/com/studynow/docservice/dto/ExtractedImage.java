package com.studynow.docservice.dto;

/**
 * One embedded diagram/photo (PPTX) or rendered page (PDF), base64-encoded so
 * it can travel over plain JSON. The Node backend decodes this and uploads it
 * to Supabase Storage itself — this service never talks to storage directly,
 * so it stays a stateless, credential-free worker.
 */
public class ExtractedImage {
    private String pageRef;
    private String fileName;
    private String contentType;
    private String base64Data;

    public ExtractedImage() {}

    public ExtractedImage(String pageRef, String fileName, String contentType, String base64Data) {
        this.pageRef = pageRef;
        this.fileName = fileName;
        this.contentType = contentType;
        this.base64Data = base64Data;
    }

    public String getPageRef() { return pageRef; }
    public void setPageRef(String pageRef) { this.pageRef = pageRef; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }

    public String getBase64Data() { return base64Data; }
    public void setBase64Data(String base64Data) { this.base64Data = base64Data; }
}
