declare module "adm-zip" {
  type AdmZipEntry = {
    entryName: string;
    isDirectory: boolean;
    getData: () => Buffer;
  };

  const AdmZip: new (input?: string | Buffer) => {
    extractAllTo: (targetPath: string, overwrite?: boolean) => void;
    addFile: (path: string, data: Buffer) => void;
    writeZip: (targetPath: string) => void;
    getEntries: () => AdmZipEntry[];
  };
  export default AdmZip;
}

declare module "rtf2text" {
  const converter: unknown;
  export default converter;
}
