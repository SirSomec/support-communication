import { createHash, createHmac } from "node:crypto";
import {
  type ObjectStorageMetadataInput,
  type ObjectStorageObjectMetadata,
  type ObjectStorageSignDownloadInput,
  type ObjectStorageSignUploadInput,
  type ObjectStorageSigner,
  type SignedObjectStorageUrl
} from "./workspace.service.js";

export interface ObjectStorageSignerSource {
  S3_ACCESS_KEY?: string;
  S3_BUCKET?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_SECRET_KEY?: string;
}

export interface ObjectStorageSignerOptions {
  expiresSeconds?: number;
  now?: () => Date;
}

export interface DeterministicObjectStorageSignerOptions extends ObjectStorageSignerOptions {
  metadata?: (input: ObjectStorageMetadataInput) => ObjectStorageObjectMetadata | undefined;
  metadataByFileId?: Record<string, ObjectStorageObjectMetadata | undefined>;
  onMetadataInput?: (input: ObjectStorageMetadataInput) => void;
}

export function createObjectStorageSigner(
  source: ObjectStorageSignerSource = process.env,
  options: ObjectStorageSignerOptions = {}
): ObjectStorageSigner {
  return hasS3Configuration(source)
    ? createS3CompatibleObjectStorageSigner(source, options)
    : createLocalObjectStorageSigner(options);
}

export function createDeterministicObjectStorageSigner(
  options: DeterministicObjectStorageSignerOptions = {}
): ObjectStorageSigner {
  const expiresSeconds = options.expiresSeconds ?? 900;
  const now = options.now ?? (() => new Date("2026-06-28T12:00:00.000Z"));
  const metadataByFileId = options.metadataByFileId ?? {};

  return {
    getObjectMetadata(input: ObjectStorageMetadataInput): ObjectStorageObjectMetadata | undefined {
      options.onMetadataInput?.(input);
      if (options.metadata) {
        return options.metadata(input);
      }
      return metadataByFileId[input.fileId];
    },

    signDownload(input: ObjectStorageSignDownloadInput): SignedObjectStorageUrl {
      return {
        method: "GET",
        url: `https://storage.example.test/download/${input.fileId}`,
        expiresAt: addSeconds(now(), expiresSeconds).toISOString()
      };
    },

    signUpload(input: ObjectStorageSignUploadInput): SignedObjectStorageUrl {
      return {
        method: "PUT",
        url: `https://storage.example.test/upload/${input.fileId}`,
        expiresAt: addSeconds(now(), expiresSeconds).toISOString()
      };
    }
  };
}

export function createS3CompatibleObjectStorageSigner(
  source: Required<Pick<ObjectStorageSignerSource, "S3_ACCESS_KEY" | "S3_BUCKET" | "S3_ENDPOINT" | "S3_SECRET_KEY">> & ObjectStorageSignerSource,
  options: ObjectStorageSignerOptions = {}
): ObjectStorageSigner {
  const endpoint = new URL(source.S3_ENDPOINT);
  const accessKey = source.S3_ACCESS_KEY;
  const secretKey = source.S3_SECRET_KEY;
  const bucket = source.S3_BUCKET;
  const region = source.S3_REGION?.trim() || "us-east-1";
  const expiresSeconds = options.expiresSeconds ?? 900;
  const now = options.now ?? (() => new Date());

  return {
    signDownload(input: ObjectStorageSignDownloadInput): SignedObjectStorageUrl {
      const signedAt = now();
      return {
        method: "GET",
        url: presignS3Url({ accessKey, bucket, endpoint, expiresSeconds, method: "GET", objectKey: input.objectKey, region, secretKey, signedAt }),
        expiresAt: addSeconds(signedAt, expiresSeconds).toISOString()
      };
    },

    signUpload(input: ObjectStorageSignUploadInput): SignedObjectStorageUrl {
      const signedAt = now();
      return {
        method: "PUT",
        url: presignS3Url({
          accessKey,
          bucket,
          endpoint,
          expiresSeconds,
          headers: {
            "content-type": input.contentType
          },
          method: "PUT",
          objectKey: input.objectKey,
          region,
          secretKey,
          signedAt
        }),
        expiresAt: addSeconds(signedAt, expiresSeconds).toISOString(),
        headers: {
          "content-type": input.contentType
        }
      };
    }
  };
}

export function createLocalObjectStorageSigner(options: ObjectStorageSignerOptions = {}): ObjectStorageSigner {
  const expiresSeconds = options.expiresSeconds ?? 900;
  const now = options.now ?? (() => new Date());

  return {
    signDownload(input: ObjectStorageSignDownloadInput): SignedObjectStorageUrl {
      return {
        method: "GET",
        url: `https://storage.local/download/${input.fileId}`,
        expiresAt: addSeconds(now(), expiresSeconds).toISOString()
      };
    },

    signUpload(input: ObjectStorageSignUploadInput): SignedObjectStorageUrl {
      return {
        method: "PUT",
        url: `https://storage.local/upload/${input.fileId}`,
        expiresAt: addSeconds(now(), expiresSeconds).toISOString()
      };
    }
  };
}

interface PresignS3UrlInput {
  accessKey: string;
  bucket: string;
  endpoint: URL;
  expiresSeconds: number;
  headers?: Record<string, string>;
  method: "GET" | "PUT";
  objectKey: string;
  region: string;
  secretKey: string;
  signedAt: Date;
}

function presignS3Url(input: PresignS3UrlInput): string {
  const dateStamp = formatDateStamp(input.signedAt);
  const amzDate = formatAmzDate(input.signedAt);
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const canonicalUri = canonicalS3Path(input.endpoint, input.bucket, input.objectKey);
  const query = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaderNames(input.headers)
  };
  const canonicalQuery = canonicalQueryString(query);
  const canonicalHeaders = `${canonicalHeaderString(input.endpoint, input.headers)}\n`;
  const signedHeaders = signedHeaderNames(input.headers);
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest)
  ].join("\n");
  const signingKey = deriveSigningKey(input.secretKey, dateStamp, input.region);
  const signature = hmacHex(signingKey, stringToSign);
  return `${input.endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function hasS3Configuration(source: ObjectStorageSignerSource): source is Required<Pick<ObjectStorageSignerSource, "S3_ACCESS_KEY" | "S3_BUCKET" | "S3_ENDPOINT" | "S3_SECRET_KEY">> & ObjectStorageSignerSource {
  return Boolean(
    source.S3_ACCESS_KEY?.trim()
    && source.S3_BUCKET?.trim()
    && source.S3_ENDPOINT?.trim()
    && source.S3_SECRET_KEY?.trim()
  );
}

function canonicalS3Path(endpoint: URL, bucket: string, objectKey: string): string {
  const basePath = endpoint.pathname.replace(/\/+$/, "");
  return `${basePath}/${encodePathSegment(bucket)}/${objectKey.split("/").map(encodePathSegment).join("/")}`;
}

function canonicalQueryString(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function canonicalHeaderString(endpoint: URL, headers: Record<string, string> = {}): string {
  const normalized = {
    ...Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")])),
    host: endpoint.host
  };

  return Object.entries(normalized)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value}`)
    .join("\n");
}

function signedHeaderNames(headers: Record<string, string> = {}): string {
  return [...Object.keys(headers).map((key) => key.toLowerCase()), "host"].sort().join(";");
}

function deriveSigningKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmacBuffer(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmacBuffer(dateKey, region);
  const serviceKey = hmacBuffer(regionKey, "s3");
  return hmacBuffer(serviceKey, "aws4_request");
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value, "utf8").digest("hex");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function encodePathSegment(value: string): string {
  if (value === ".") {
    return "%2E";
  }

  if (value === "..") {
    return "%2E%2E";
  }

  return encodeRfc3986(value);
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatDateStamp(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatAmzDate(value: Date): string {
  return `${formatDateStamp(value)}T${value.toISOString().slice(11, 19).replace(/:/g, "")}Z`;
}

function addSeconds(value: Date, seconds: number): Date {
  return new Date(value.getTime() + seconds * 1000);
}
