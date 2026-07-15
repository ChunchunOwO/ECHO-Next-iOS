import { normalizeEchoLinkHost, normalizeEchoLinkToken, type EchoLinkConnection } from './client';

const normalizeScheme = (value: string | null): EchoLinkConnection['scheme'] =>
  value === 'https' ? 'https' : 'http';

export const parsePairingUri = (input: string): EchoLinkConnection => {
  const raw = input.trim();
  if (!raw) {
    throw new Error('请先粘贴电脑端生成的配对链接。');
  }

  const url = new URL(raw);
  if (url.protocol === 'echo:' && url.hostname === 'pair') {
    const host = normalizeEchoLinkHost(url.searchParams.get('host') ?? '');
    const token = normalizeEchoLinkToken(url.searchParams.get('token') ?? '');
    const port = Number(url.searchParams.get('port') ?? 26789);
    if (!host || !token) {
      throw new Error('配对链接缺少 host 或 token。');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('配对链接中的端口无效。');
    }

    return {
      host,
      port,
      token,
      name: url.searchParams.get('name')?.trim() || 'PC ECHO',
      scheme: normalizeScheme(url.searchParams.get('scheme')),
    };
  }

  if (url.protocol === 'http:' || url.protocol === 'https:') {
    const token = normalizeEchoLinkToken(url.searchParams.get('token') ?? '');
    const port = Number(url.port || 26789);
    if (!url.hostname || !token) {
      throw new Error('网页控制链接缺少电脑 IP 或 token。');
    }

    return {
      host: normalizeEchoLinkHost(url.hostname),
      port: Number.isFinite(port) && port > 0 ? port : 26789,
      token,
      name: url.searchParams.get('name')?.trim() || 'PC ECHO',
      scheme: normalizeScheme(url.protocol.replace(':', '')),
    };
  }

  throw new Error('这不是有效的 ECHO Link 配对链接。请使用 echo://pair?... 或 http://电脑IP:26789/echo-link/web?token=...。');
};
