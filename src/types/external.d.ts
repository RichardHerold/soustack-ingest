declare module "adm-zip" {
  const AdmZip: new (input?: string | Buffer) => {
    extractAllTo: (targetPath: string, overwrite?: boolean) => void;
    addFile: (path: string, data: Buffer) => void;
    writeZip: (targetPath: string) => void;
  };
  export default AdmZip;
}

declare module "rtf-to-text" {
  const converter: unknown;
  export default converter;
}
