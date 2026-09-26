import Image from "next/image";
import { LoginForm } from "./login-form";
import { signInWithMicrosoftAction, signInWithGoogleAction } from "./actions";

// F22: SSOのボタンは、対応する環境変数(OAuthアプリの登録情報)が設定されている時だけ
// 表示する。サーバーコンポーネントでprocess.envを直接見て判定する
// (未設定の環境では段階1のCredentialsログインだけが表示される)。
export default function LoginPage() {
  const microsoftEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div>
          <Image src="/logo.png" alt="" width={56} height={56} priority className="mb-3 rounded-full" />
          <h1 className="text-xl font-semibold text-ink">
            Synclie にログイン
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            メールアドレスとパスワード、または学校・組織のアカウント(SSO)でログインします。
          </p>
        </div>

        <LoginForm />

        {(microsoftEnabled || googleEnabled) && (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-xs text-ink-muted">学校・組織のアカウントでログイン(F22)</p>
            {microsoftEnabled && (
              <form action={signInWithMicrosoftAction}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
                >
                  Microsoftでログイン
                </button>
              </form>
            )}
            {googleEnabled && (
              <form action={signInWithGoogleAction}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface"
                >
                  Googleでログイン
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
