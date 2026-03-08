const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * Service to interact with Google Drive AppData folder.
 * NOTE: Uses string-based multipart body to avoid Blob (not supported on React Native Android).
 */
export const GoogleDriveService = {
    /**
     * Find the database file in appDataFolder and return its ID and ETag.
     */
    async findFile(accessToken: string, fileName: string): Promise<{ id: string; etag: string } | null> {
        const response = await fetch(
            `${DRIVE_API_URL}/files?q=name='${fileName}' and parents in 'appDataFolder'&spaces=appDataFolder&fields=files(id,headRevisionId)&t=${Date.now()}`,
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
            const file = data.files[0];
            return { id: file.id, etag: file.headRevisionId || '' };
        }
        return null;
    },

    /**
     * Get file metadata (ETag) for conflict resolution
     */
    async getFileMetadata(accessToken: string, fileId: string): Promise<{ etag: string }> {
        const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?fields=headRevisionId`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GoogleDriveService: getFileMetadata failed with status ${response.status}: ${errorText}`);
            throw new Error(`GoogleDriveService.getFileMetadata failed: ${response.status}`);
        }

        const data = await response.json();
        return { etag: data.headRevisionId || '' };
    },

    /**
     * Download content of a file
     */
    async downloadFile(accessToken: string, fileId: string): Promise<any> {
        const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media&t=${Date.now()}`, {
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
     * Returns the new ID and headRevisionId (ETag).
     */
    async uploadFile(accessToken: string, fileName: string, data: any, fileId?: string, previousEtag?: string): Promise<{ id: string, etag: string }> {
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

        // Request id and headRevisionId in fields
        const url = fileId
            ? `${UPLOAD_API_URL}/${fileId}?uploadType=multipart&fields=id,headRevisionId`
            : `${UPLOAD_API_URL}?uploadType=multipart&fields=id,headRevisionId`;

        const method = fileId ? 'PATCH' : 'POST';

        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
        };

        if (fileId && previousEtag) {
            // Use If-Match for optimistic concurrency control
            headers['If-Match'] = `"${previousEtag}"`;
        }

        const response = await fetch(url, {
            method,
            headers,
            body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GoogleDriveService: Upload failed with status ${response.status}: ${errorText}`);
            throw new Error(`Upload failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`GoogleDriveService: File ${fileId ? 'updated' : 'created'} successfully. ID: ${result.id}, ETag: ${result.headRevisionId}`);

        return { id: result.id, etag: result.headRevisionId || '' };
    },

};
