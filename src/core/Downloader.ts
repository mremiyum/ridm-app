import * as FileSystem from 'expo-file-system/legacy';

export interface FileMetadata {
  size: number;
  mimeType: string;
  fileName: string;
  isResumable: boolean;
}

export async function fetchFileMetadata(url: string): Promise<FileMetadata | null> {
  let formattedUrl = url;
  if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
    formattedUrl = 'https://' + formattedUrl;
  }
  let fileName = formattedUrl.substring(formattedUrl.lastIndexOf('/') + 1).split('?')[0];
  if (!fileName || fileName.length === 0) fileName = `ridm_file_${Date.now()}.bin`;

  try {
    const response = await fetch(formattedUrl, { method: 'HEAD' });
    if (!response.ok) throw new Error('HEAD reddedildi');
    const size = parseInt(response.headers.get('content-length') || '0', 10);
    const mimeType = response.headers.get('content-type') || 'application/octet-stream';
    return { size, mimeType, fileName, isResumable: response.headers.get('accept-ranges') === 'bytes' };
  } catch (error) {
    return { size: 0, mimeType: 'application/octet-stream', fileName, isResumable: false };
  }
}

export async function resolveFileConflict(
  targetFolderUri: string, fileName: string, serverSize: number
): Promise<{ action: 'download' | 'skip', resolvedFileName: string }> {
  let currentFileName = fileName;
  const nameParts = fileName.lastIndexOf('.');
  const baseName = nameParts !== -1 ? fileName.substring(0, nameParts) : fileName;
  const extension = nameParts !== -1 ? fileName.substring(nameParts) : '';

  if (targetFolderUri.startsWith('content://')) {
    try {
      const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(targetFolderUri);
      
      // SAF (Şifreli Dizin) için hem varlık hem boyut kontrol eden fonksiyon
      const checkFile = async (name: string) => {
        const encodedName = encodeURIComponent(name);
        const fileUri = files.find(f => f.endsWith(encodedName) || f.endsWith(`/${name}`) || f.endsWith(`%2F${name}`));
        if (!fileUri) return { exists: false, sizeMatch: false };
        
        try {
          const info = await FileSystem.getInfoAsync(fileUri);
          return { exists: true, sizeMatch: (info.size === serverSize && serverSize > 0) };
        } catch (e) {
          return { exists: true, sizeMatch: false };
        }
      };

      let fileStatus = await checkFile(currentFileName);

      // Dosya yoksa direkt indir
      if (!fileStatus.exists) return { action: 'download', resolvedFileName: currentFileName };
      
      // DOSYA VAR VE BOYUT AYNIYSA (Unutulan Mantık Burasıydı)
      if (fileStatus.sizeMatch) return { action: 'skip', resolvedFileName: currentFileName };

      // Dosya var ama boyut farklı (Yarım inmiş veya farklı dosya) -> Numaralandır
      let counter = 1;
      while (fileStatus.exists) {
        currentFileName = `${baseName}(${counter})${extension}`;
        fileStatus = await checkFile(currentFileName);
        counter++;
      }
      return { action: 'download', resolvedFileName: currentFileName };
    } catch (e) {
      return { action: 'download', resolvedFileName: currentFileName };
    }
  } else {
    // Uygulama içi (file://) normal dizin kontrolleri
    const cleanTargetFolder = targetFolderUri.replace(/\/$/, '');
    let fileUri = `${cleanTargetFolder}/${currentFileName}`;
    let fileInfo = await FileSystem.getInfoAsync(fileUri);

    if (!fileInfo.exists) return { action: 'download', resolvedFileName: currentFileName };
    if (!fileInfo.isDirectory && fileInfo.size === serverSize && serverSize > 0) return { action: 'skip', resolvedFileName: currentFileName };

    let counter = 1;
    while (fileInfo.exists) {
      currentFileName = `${baseName}(${counter})${extension}`;
      fileUri = `${cleanTargetFolder}/${currentFileName}`;
      fileInfo = await FileSystem.getInfoAsync(fileUri);
      counter++;
    }
    return { action: 'download', resolvedFileName: currentFileName };
  }
}
