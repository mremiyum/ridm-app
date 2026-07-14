import * as FileSystem from 'expo-file-system/legacy';

type LogType = 'error' | 'skipped';

export const getSmartFolderName = (mimeType: string, fileName: string): string => {
  const mime = mimeType.toLowerCase();
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  if (mime.startsWith('video/') || ['.mp4', '.mkv', '.avi', '.flv', '.mov', '.webm'].includes(ext)) return 'Videos';
  if (mime.startsWith('audio/') || ['.mp3', '.m4a', '.opus', '.wav', '.flac', '.ogg'].includes(ext)) return 'Audio';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('compressed') || ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'Archives';
  if (mime.includes('pdf') || mime.includes('document') || mime.includes('text/') || ['.pdf', '.docx', '.txt', '.xlsx', '.pptx', '.epub'].includes(ext)) return 'Documents';
  return 'Others';
};

export const ensureDownloadDirectory = async (
  baseDirectoryUri: string,
  smartFolderEnabled: boolean,
  mimeType: string,
  fileName: string
): Promise<string> => {
  if (!smartFolderEnabled) return baseDirectoryUri.replace(/\/$/, '');

  const subFolder = getSmartFolderName(mimeType, fileName);

  if (baseDirectoryUri.startsWith('content://')) {
    // SAF (Şifreli Dış Klasör) İçin Akıllı Klasör Oluşturma Motoru
    const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(baseDirectoryUri);
    const encodedFolder = encodeURIComponent(subFolder);
    const existingDir = files.find(f => f.endsWith(encodedFolder) || f.endsWith(`/${subFolder}`));
    
    if (existingDir) {
      return existingDir;
    } else {
      return await FileSystem.StorageAccessFramework.makeDirectoryAsync(baseDirectoryUri, subFolder);
    }
  } else {
    // Normal Uygulama İçi Klasörler
    const cleanBaseUri = baseDirectoryUri.replace(/\/$/, '');
    const targetPath = `${cleanBaseUri}/${subFolder}`;
    const dirInfo = await FileSystem.getInfoAsync(targetPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(targetPath, { intermediates: true });
    }
    return targetPath;
  }
};

export const writeLogEntry = async (
  baseDirectoryUri: string,
  type: LogType,
  fileNameOrUrl: string,
  details: string
): Promise<void> => {
  try {
    const timestamp = new Date().toLocaleString();
    const logMessage = `[${timestamp}] Dosya: ${fileNameOrUrl} | Durum: ${details}\n`;

    if (baseDirectoryUri.startsWith('content://')) {
       // SAF (Şifreli Klasör) içine Logs klasörü ve dosyası oluşturma
       const files = await FileSystem.StorageAccessFramework.readDirectoryAsync(baseDirectoryUri);
       let logsDirUri = files.find(f => f.endsWith('Logs') || f.endsWith('%2FLogs'));
       if (!logsDirUri) {
         logsDirUri = await FileSystem.StorageAccessFramework.makeDirectoryAsync(baseDirectoryUri, 'Logs');
       }

       const logFiles = await FileSystem.StorageAccessFramework.readDirectoryAsync(logsDirUri);
       const logFileName = `${type}.txt`;
       const existingLogFile = logFiles.find(f => f.endsWith(logFileName) || f.endsWith(`%2F${logFileName}`));

       if (existingLogFile) {
         const existingContent = await FileSystem.readAsStringAsync(existingLogFile);
         await FileSystem.StorageAccessFramework.writeAsStringAsync(existingLogFile, existingContent + logMessage);
       } else {
         const newLogFile = await FileSystem.StorageAccessFramework.createFileAsync(logsDirUri, logFileName, 'text/plain');
         if(newLogFile) await FileSystem.StorageAccessFramework.writeAsStringAsync(newLogFile, logMessage);
       }
    } else {
       const cleanBaseUri = baseDirectoryUri.replace(/\/$/, '');
       const logsDir = `${cleanBaseUri}/Logs`;
       const dirInfo = await FileSystem.getInfoAsync(logsDir);
       if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(logsDir, { intermediates: true });

       const logFileUri = `${logsDir}/${type}.txt`;
       const fileInfo = await FileSystem.getInfoAsync(logFileUri);
       if (fileInfo.exists) {
         const existingContent = await FileSystem.readAsStringAsync(logFileUri);
         await FileSystem.writeAsStringAsync(logFileUri, existingContent + logMessage);
       } else {
         await FileSystem.writeAsStringAsync(logFileUri, logMessage);
       }
    }
  } catch (error) {
    console.log('Log yazılamadı:', error);
  }
};
