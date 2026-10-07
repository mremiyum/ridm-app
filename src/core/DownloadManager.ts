import * as FileSystemLegacy from 'expo-file-system/legacy';
import { fetchFileMetadata, resolveFileConflict } from './Downloader';
import { ensureDownloadDirectory, writeLogEntry } from './SmartFolder';
import { exportToPublicFolder } from './FileExporter'; 

type ProgressCallback = (progress: number, downloadedStr: string, speedStr: string) => void;

const activeDownloads: { [key: string]: FileSystemLegacy.DownloadResumable } = {};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const startFileDownload = async (
  itemId: string,
  url: string,
  baseDownloadPath: string,
  smartFolderEnabled: boolean,
  onProgress: ProgressCallback,
  onFinished: (finalPath: string) => void,
  onError: (errorMsg: string) => void
): Promise<void> => {
  try {
    let formattedUrl = url;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const metadata = await fetchFileMetadata(formattedUrl);
    if (!metadata) {
      const errorMsg = 'Could not connect, or the link is invalid.';
      await writeLogEntry(baseDownloadPath, 'error', formattedUrl, errorMsg);
      onError(errorMsg);
      return;
    }

    const sandboxDir = `${FileSystemLegacy.documentDirectory}RIDM_Temp`;
    const dirInfo = await FileSystemLegacy.getInfoAsync(sandboxDir);
    if (!dirInfo.exists) {
      await FileSystemLegacy.makeDirectoryAsync(sandboxDir, { intermediates: true });
    }

    // Hedef klasör SAF ise akıllı klasör URI'sini (örn: .../Videos) çekiyoruz
    const targetFolder = await ensureDownloadDirectory(baseDownloadPath, smartFolderEnabled, metadata.mimeType, metadata.fileName);
    const conflictResult = await resolveFileConflict(targetFolder, metadata.fileName, metadata.size);
    
    if (conflictResult.action === 'skip') {
      await writeLogEntry(targetFolder, 'skipped', metadata.fileName, 'A file with the same name and size already exists.');
      onError('DUPLICATE_SKIPPED');
      return;
    }

    const resolvedFileName = conflictResult.resolvedFileName;
    const tempFileUri = `${sandboxDir}/${resolvedFileName}`;
    
    let lastTime = Date.now();
    let lastBytes = 0;
    let lastSpeedStr = '0 KB/s';

    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      formattedUrl,
      tempFileUri,
      { md5: false },
      (progressData) => {
        const totalWritten = progressData.totalBytesWritten;
        const totalExpected = progressData.totalBytesExpectedToWrite;
        
        const progressPercent = totalExpected > 0 ? Math.round((totalWritten / totalExpected) * 100) : 0;
        const downloadedStr = `${formatBytes(totalWritten)}`;
        
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastTime) / 1000;

        if (timeDiff >= 0.5) {
          const bytesDiff = totalWritten - lastBytes;
          const bytesPerSecond = bytesDiff / timeDiff;
          lastSpeedStr = `${formatBytes(bytesPerSecond)}/s`;
          lastTime = currentTime;
          lastBytes = totalWritten;
        }
        
        onProgress(progressPercent, downloadedStr, lastSpeedStr);
      }
    );

    activeDownloads[itemId] = downloadResumable;
    const result = await downloadResumable.downloadAsync();
    delete activeDownloads[itemId];

    if (result && result.uri) {
      if (baseDownloadPath.startsWith('content://')) {
          // DÜZELTME: baseDownloadPath değil, akıllı klasör işlenmiş targetFolder verilmeli ki doğru klasöre kopyalasın
          const publicUri = await exportToPublicFolder(result.uri, targetFolder, resolvedFileName, metadata.mimeType);
          if (publicUri) onFinished(publicUri);
          else throw new Error('File could not be exported to external storage.');
      } else {
          const cleanTargetFolder = targetFolder.replace(/\/$/, '');
          const finalFileUri = `${cleanTargetFolder}/${resolvedFileName}`;
          await FileSystemLegacy.moveAsync({ from: result.uri, to: finalFileUri });
          onFinished(finalFileUri);
      }
    } else {
      throw new Error('Download could not be completed.');
    }
  } catch (error: any) {
    console.log('İndirme İptal / Hata:', error.message);
    await writeLogEntry(baseDownloadPath, 'error', url, error.message || 'Bilinmeyen Hata');
    onError(error.message || 'Download error.');
  }
};

export const pauseDownload = async (itemId: string): Promise<string | null> => {
  const downloadInstance = activeDownloads[itemId];
  if (!downloadInstance) return null;
  try {
    const pauseResult = await downloadInstance.pauseAsync();
    return pauseResult.resumeData || null;
  } catch (error) {
    console.log('Duraklatma hatası:', error);
    return null;
  }
};

export const resumeDownload = async (
  itemId: string,
  resumeData: string,
  onProgress: ProgressCallback
): Promise<FileSystemLegacy.DownloadResult | null> => {
  try {
    let lastTime = Date.now();
    let lastBytes = 0;
    let lastSpeedStr = '0 KB/s';

    const downloadResumable = FileSystemLegacy.createDownloadResumable(
      '', '', {},
      (progressData) => {
        const totalWritten = progressData.totalBytesWritten;
        const totalExpected = progressData.totalBytesExpectedToWrite;
        const progressPercent = totalExpected > 0 ? Math.round((totalWritten / totalExpected) * 100) : 0;
        
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastTime) / 1000;
        if (timeDiff >= 0.5 && lastBytes > 0) {
          const bytesDiff = totalWritten - lastBytes;
          const bytesPerSecond = bytesDiff / timeDiff;
          lastSpeedStr = `${formatBytes(bytesPerSecond)}/s`;
          lastTime = currentTime;
        } else if (lastBytes === 0) {
           lastTime = currentTime;
        }
        lastBytes = totalWritten;

        onProgress(progressPercent, formatBytes(totalWritten), lastSpeedStr);
      },
      resumeData
    );
    activeDownloads[itemId] = downloadResumable;
    const result = await downloadResumable.downloadAsync();
    delete activeDownloads[itemId];
    return result;
  } catch (error) {
    console.log('Devam etme hatası:', error);
    return null;
  }
};
