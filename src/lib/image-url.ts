/**
 * A small square version of a profile photo, for avatars and list rows.
 * Photos stored by this app have a `-thumb` twin next to them; Cloudinary photos
 * get a crop transformation; anything else (a pasted link) is used as is.
 */
export function thumbnailUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/\/uploads\/profiles\/[a-f0-9]{24}\/[a-f0-9]{24}\.webp$/i.test(url)) return url.replace(/\.webp$/i, "-thumb.webp");
  if (url.includes("res.cloudinary.com/") && url.includes("/image/upload/") && !url.includes("/upload/c_fill")) {
    return url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_256,h_256,q_auto,f_auto/");
  }
  return url;
}
