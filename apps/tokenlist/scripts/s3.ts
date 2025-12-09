import * as Bun from 'bun'

export const s3 = new Bun.S3Client({
	bucket: 'porto-dev-assets',
	endpoint: Bun.env.S3_ENDPOINT,
	accessKeyId: Bun.env.S3_ACCESS_KEY_ID,
	secretAccessKey: Bun.env.S3_SECRET_ACCESS_KEY,
})

export async function uploadFile(params: {
	file?: Bun.FileBlob | undefined
	filePath?: string | undefined
}) {
	const { file, filePath } = params
	if (!file || !filePath) throw new Error('File or filePath is required')

	const fileToUpload = file ?? Bun.file(filePath)
	const fileKey = fileToUpload.name
	if (!fileKey) throw new Error('File key is required')

	const fileUpload = s3.file(fileKey, {
		type: fileToUpload.type,
		bucket: Bun.env.S3_BUCKET_NAME,
	})

	await fileUpload.write(await fileUpload.arrayBuffer())

	return fileUpload.presign({
		expiresIn: 60 * 60 * 24 * 30, // 30 days
	})
}
