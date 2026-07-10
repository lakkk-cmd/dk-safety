/** 브라우저 전용 — 업로드 전 이미지를 Canvas로 리사이즈해 전송 용량을 줄인다.
 *  현장(지하 분전실 등) 약전파 환경에서 원본 그대로 올리면 느리고 실패율이 높음.
 *  점검 증빙용 사진이라 인테리어 데코 사진보다 여유 있게 긴 쪽 1600px을 상한으로 둔다. */
export async function downscaleImageFile(file: File, maxDim = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("이미지를 디코딩하지 못했습니다."));
    el.src = dataUrl;
  });

  // 이미 상한보다 작으면 원본 그대로 전송 — 불필요한 재인코딩으로 화질만 깎는 걸 방지
  if (img.width <= maxDim && img.height <= maxDim) return file;

  let { width, height } = img;
  if (width > height) {
    height = Math.round((height * maxDim) / width);
    width = maxDim;
  } else {
    width = Math.round((width * maxDim) / height);
    height = maxDim;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;

  const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

/** FileList/File[] 전체를 일괄 다운스케일. 개별 파일 처리 실패는 원본으로 폴백해 업로드 자체를 막지 않는다. */
export async function downscaleImageFiles(files: File[], maxDim = 1600, quality = 0.85): Promise<File[]> {
  return Promise.all(
    files.map((file) => downscaleImageFile(file, maxDim, quality).catch(() => file)),
  );
}
