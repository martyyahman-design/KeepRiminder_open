const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Service to interact with Google Drive AppData folder
 */
export const GoogleDriveService = {
    /**
     * Find the database file in appDataFolder
     */
    async findFile(accessToken: string, fileName: string): Promise<string | null> {
        const response = await fetch(
            `${DRIVE_API_URL}/files?q=name='${fileName}' and parents in 'appDataFolder'&spaces=appDataFolder`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );
        const data = await response.json();
        if (data.files && data.files.length > 0) {
            return data.files[0].id;
        }
        return null;
    },

    /**
     * Download content of a file
     */
    async downloadFile(accessToken: string, fileId: string): Promise<any> {
        const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        return response.json();
    },

    /**
     * Upload (Create or Update) database file
     */
    async uploadFile(accessToken: string, fileName: string, data: any, fileId?: string): Promise<string> {
        const metadata = {
            name: fileName,
            parents: fileId ? undefined : ['appDataFolder'],
        };

        const formData = new FormData();
        formData.append(
            'metadata',
            new Blob([JSON.stringify(metadata)], { type: 'application/json' })
        );
        formData.append(
            'file',
            new Blob([JSON.stringify(data)], { type: 'application/json' })
        );

        const url = fileId
            ? `${UPLOAD_API_URL}/${fileId}?uploadType=multipart`
            : `${UPLOAD_API_URL}?uploadType=multipart`;

        const method = fileId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
        });

        const result = await response.json();
        return result.id;
    },
};
