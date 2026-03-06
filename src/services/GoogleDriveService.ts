const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Service to interact with Google Drive AppData folder.
 * NOTE: Uses string-based multipart body to avoid Blob (not supported on React Native Android).
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

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GoogleDriveService: findFile failed with status ${response.status}: ${errorText}`);
            throw new Error(`GoogleDriveService.findFile failed: ${response.status}`);
        }

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

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GoogleDriveService: downloadFile failed with status ${response.status}: ${errorText}`);
            throw new Error(`GoogleDriveService.downloadFile failed: ${response.status}`);
        }

        return response.json();
    },

    /**
     * Upload (Create or Update) database file.
     * Uses raw multipart/related string body instead of Blob for React Native compatibility.
     */
    async uploadFile(accessToken: string, fileName: string, data: any, fileId?: string): Promise<string> {
        const boundary = 'keepreminder_boundary_xyz';

        const metadata = JSON.stringify({
            name: fileName,
            ...(fileId ? {} : { parents: ['appDataFolder'] }),
        });
        const body_content = JSON.stringify(data);

        const body = [
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            metadata,
            `--${boundary}`,
            'Content-Type: application/json; charset=UTF-8',
            '',
            body_content,
            `--${boundary}--`,
        ].join('\r\n');

        const url = fileId
            ? `${UPLOAD_API_URL}/${fileId}?uploadType=multipart`
            : `${UPLOAD_API_URL}?uploadType=multipart`;

        const method = fileId ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GoogleDriveService: Upload failed with status ${response.status}: ${errorText}`);
            throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`GoogleDriveService: File ${fileId ? 'updated' : 'created'} successfully. ID: ${result.id}`);
        return result.id;
    },
};
