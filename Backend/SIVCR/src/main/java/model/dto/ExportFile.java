package model.dto;

// el contenido del archivo, su tipo MIME y el nombre sugerido.
public record ExportFile(byte[] content, String mimeType, String fileName) { }