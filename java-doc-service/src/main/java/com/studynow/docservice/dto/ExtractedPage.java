package com.studynow.docservice.dto;

/**
 * One page (PDF) or slide (PPTX) worth of extracted plain text, ready to be
 * chunked and stored as a `noteChunks` row by the Node backend.
 */
public class ExtractedPage {
    private String pageRef;   // e.g. "Page 3" or "Slide 3"
    private int order;        // 1-based order within the document
    private String text;

    public ExtractedPage() {}

    public ExtractedPage(String pageRef, int order, String text) {
        this.pageRef = pageRef;
        this.order = order;
        this.text = text;
    }

    public String getPageRef() { return pageRef; }
    public void setPageRef(String pageRef) { this.pageRef = pageRef; }

    public int getOrder() { return order; }
    public void setOrder(int order) { this.order = order; }

    public String getText() { return text; }
    public void setText(String text) { this.text = text; }
}
