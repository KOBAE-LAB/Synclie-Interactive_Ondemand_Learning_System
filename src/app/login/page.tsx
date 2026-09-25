import { LoginForm } from "./login-form";
import { signInWithMicrosoftAction, signInWithGoogleAction } from "./actions";

// F22: SSOのボタンは、対応する環境変数(OAuthアプリの登録情報)が設定されている時だけ
// 表示する。サーバーコンポーネントでprocess.envを直接見て判定する
// (未設定の環境では段階1のCredentialsログインだけが表示される)。
export default function LoginPage() {
  const microsoftEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Synclie にログイン
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            メールアドレスとパスワード、または学校・組織のアカウント(SSO)でログインします。
          </p>
        </div>

        <LoginForm />

        {(microsoftEnabled || googleEnabled) && (
          <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500">学校・組織のアカウントでログイン(F22)</p>
            {microsoftEnabled && (
              <form action={signInWithMicrosoftAction}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Microsoftでログイン
                </button>
              </form>
            )}
            {googleEnabled && (
              <form action={signInWithGoogleAction}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
