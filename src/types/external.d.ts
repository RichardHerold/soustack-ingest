declare module "rtf2text" {
  const converter: (input: string) => string | Promise<string>;
  export default converter;
  export = converter;
}

declare module "mammoth";
declare module "pdf-parse";
