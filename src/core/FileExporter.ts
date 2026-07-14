import * as FileSystem from 'expo-file-system/legacy';

export const requestStoragePermission = async (): Promise<string | null> => {
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (permissions.granted) return permissions.directoryUri;
    return null;
  } catch (error) {
    console.log('Klasör izni alınırken hata:', error);
    return null;
  }
};

export const exportToPublicFolder = async (
  sandboxFileUri: string,
  targetFolderUri: string,
  fileName: string,
  mimeType: string
): Promise<string | null> => {
  try {
    const publicFileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      targetFolderUri,
      fileName,
      mimeType
    );

    if (!publicFileUri) throw new Error('Android hedef dosya kaydı oluşturulamadı.');

    try {
      // 1. Yöntem: Standart kopyalama (Bazı cihazlarda engellenir)
      await FileSystem.copyAsync({ from: sandboxFileUri, to: publicFileUri });
    } catch (copyError) {
      // 2. Yöntem: Android kopyalamayı reddederse Base64 ile zorla yazdırır (0 Bayt hatasını çözer)
      console.log('Standart kopyalama reddedildi, Base64 köprüsü kullanılıyor...');
      const base64Data = await FileSystem.readAsStringAsync(sandboxFileUri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.StorageAccessFramework.writeAsStringAsync(publicFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
    }

    await FileSystem.deleteAsync(sandboxFileUri, { idempotent: true });

    return publicFileUri;
  } catch (error) {
    console.log('Dosya dışa aktarılırken hata:', error);
    return null;
  }
};
