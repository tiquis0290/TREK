import { useEffect, useState } from 'react'
import { fetchImageAsBlob } from '../../../api/authUrl'

interface ProviderImgProps {
  baseUrl: string
  style?: React.CSSProperties
  loading?: 'lazy' | 'eager'
}

export function ProviderImg({ baseUrl, style, loading }: ProviderImgProps) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let revoke = ''
    fetchImageAsBlob('/api' + baseUrl).then(blobUrl => {
      revoke = blobUrl
      setSrc(blobUrl)
    })

    return () => {
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [baseUrl])

  if (src) {
    return <img src={src} alt="" loading={loading} style={style} />
  }
  // Show gray rectangle as thumbnail placeholder
  return (
    <div
      style={{
        background: '#e0e0e0',
        ...style,
      }}
    />
  )
}
