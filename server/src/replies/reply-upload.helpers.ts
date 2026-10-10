import {
  BOOLEAN_STRING_VALUES,
  UPLOAD_FIELD_NAMES,
} from "../constants/domain-types";
import {
  BinaryAttachment,
  BinaryInlineImage,
} from "../email-send-queue/queued-attachment.helpers";

/**
 * Separator the composer uses to smuggle an inline image's MIME Content-ID
 * through Multer's `originalname`, as "<cid>::::<filename>".
 */
const INLINE_IMAGE_CID_SEPARATOR = "::::";

export interface ReplyUploads {
  attachments: BinaryAttachment[];
  inlineImages: BinaryInlineImage[];
}

/**
 * Splits one multipart upload into ordinary attachments and inline images,
 * recovering each inline image's Content-ID from its encoded filename so the
 * provider can set the MIME header that makes `<img src="cid:…">` resolve.
 */
export function splitReplyUploads(
  allFiles: Express.Multer.File[] = [],
): ReplyUploads {
  const attachments = allFiles
    .filter((file) => file.fieldname === UPLOAD_FIELD_NAMES.FILES)
    .map((file) => ({
      filename: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
    }));

  const inlineImages = allFiles
    .filter((file) => file.fieldname === UPLOAD_FIELD_NAMES.INLINE_IMAGES)
    .map((file) => {
      const separatorIndex = file.originalname.indexOf(
        INLINE_IMAGE_CID_SEPARATOR,
      );
      const hasContentId = separatorIndex >= 0;
      return {
        contentId: hasContentId
          ? file.originalname.substring(0, separatorIndex)
          : file.originalname,
        filename: hasContentId
          ? file.originalname.substring(
              separatorIndex + INLINE_IMAGE_CID_SEPARATOR.length,
            )
          : file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      };
    });

  return { attachments, inlineImages };
}

/** Coerces a flag that arrives as a real boolean (JSON) or "true"/"false" (form data). */
export function parseBooleanFlag(value: boolean | string | undefined): boolean {
  if (typeof value === "string") {
    return value === BOOLEAN_STRING_VALUES.TRUE;
  }
  return !!value;
}
