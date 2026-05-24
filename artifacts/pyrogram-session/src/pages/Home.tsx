import React, { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  useStartSession, 
  useVerifySession, 
  useVerify2FA 
} from "@workspace/api-client-react";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Terminal, Copy, CheckCircle2, AlertCircle, RefreshCw, KeyRound, Smartphone, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const step1Schema = z.object({
  api_id: z.coerce.number().min(1, "API ID is required"),
  api_hash: z.string().min(1, "API Hash is required"),
  phone_number: z.string().min(1, "Phone Number is required").regex(/^\+\d+/, "Must start with + and country code"),
});

const step2Schema = z.object({
  phone_code: z.string().min(5, "Code is usually 5-6 digits"),
});

const step3Schema = z.object({
  password: z.string().min(1, "Password is required"),
});

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [sessionId, setSessionId] = useState<string>("");
  const [stringSession, setStringSession] = useState<string>("");
  const [hint, setHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const startSession = useStartSession();
  const verifySession = useVerifySession();
  const verify2FA = useVerify2FA();

  const form1 = useForm<z.infer<typeof step1Schema>>({
    resolver: zodResolver(step1Schema),
    defaultValues: { api_id: "" as any, api_hash: "", phone_number: "" },
  });

  const form2 = useForm<z.infer<typeof step2Schema>>({
    resolver: zodResolver(step2Schema),
    defaultValues: { phone_code: "" },
  });

  const form3 = useForm<z.infer<typeof step3Schema>>({
    resolver: zodResolver(step3Schema),
    defaultValues: { password: "" },
  });

  const onStep1Submit = (data: z.infer<typeof step1Schema>) => {
    startSession.mutate(
      { data },
      {
        onSuccess: (res) => {
          setSessionId(res.session_id);
          setStep(2);
        },
      }
    );
  };

  const onStep2Submit = (data: z.infer<typeof step2Schema>) => {
    verifySession.mutate(
      { data: { session_id: sessionId, phone_code: data.phone_code } },
      {
        onSuccess: (res) => {
          if (res.needs_2fa) {
            setHint(res.hint || null);
            setStep(3);
          } else {
            setStringSession(res.string_session ?? "");
            setStep(4);
          }
        },
      }
    );
  };

  const onStep3Submit = (data: z.infer<typeof step3Schema>) => {
    verify2FA.mutate(
      { data: { session_id: sessionId, password: data.password } },
      {
        onSuccess: (res) => {
          console.log("2FA onSuccess res:", JSON.stringify(res));
          setStringSession(res.string_session ?? "");
          setStep(4);
        },
        onError: (err) => {
          console.log("2FA onError:", err);
        },
      }
    );
  };

  const startOver = () => {
    setStep(1);
    setSessionId("");
    setStringSession("");
    form1.reset();
    form2.reset();
    form3.reset();
    startSession.reset();
    verifySession.reset();
    verify2FA.reset();
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(stringSession);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 md:p-8 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-cyan-900/10 rounded-full blur-[150px] pointer-events-none" />
      
      <div className="w-full max-w-lg z-10">
        <div className="mb-8 flex items-center justify-center space-x-3">
          <Terminal className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-mono font-bold tracking-tight text-foreground glow-text">
            PYROGRAM<span className="text-primary">_GEN</span>
          </h1>
        </div>

        <Card className="glass-panel border-0 shadow-2xl bg-card/60 backdrop-blur-xl rounded-xl">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between mb-2">
              <CardTitle className="text-lg font-medium text-foreground">
                {step === 1 && "Authentication"}
                {step === 2 && "Verification"}
                {step === 3 && "Two-Factor Auth"}
                {step === 4 && "Session Ready"}
              </CardTitle>
              {step < 4 && (
                <span className="text-xs font-mono text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                  STEP {step}/3
                </span>
              )}
            </div>
            <CardDescription className="text-muted-foreground">
              {step === 1 && "Enter your Telegram API credentials to begin."}
              {step === 2 && "Enter the login code sent to your Telegram app."}
              {step === 3 && "Your account has 2FA enabled. Enter your password."}
              {step === 4 && "Your string session has been generated securely."}
            </CardDescription>
            
            {step < 4 && (
              <div className="w-full h-1 bg-secondary rounded-full mt-4 overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-500 ease-out" 
                  style={{ width: `${(step / 3) * 100}%` }}
                />
              </div>
            )}
          </CardHeader>
          
          <CardContent>
            {/* STEP 1: CREDENTIALS */}
            {step === 1 && (
              <Form {...form1}>
                <form onSubmit={form1.handleSubmit(onStep1Submit)} className="space-y-4">
                  {startSession.error && (
                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{(startSession.error as any)?.error || "Failed to start session"}</AlertDescription>
                    </Alert>
                  )}
                  
                  <FormField
                    control={form1.control}
                    name="api_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground uppercase">API ID</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              type="number" 
                              placeholder="1234567" 
                              className="pl-9 font-mono bg-background/50 border-white/10 focus-visible:ring-primary/50" 
                              data-testid="input-api-id"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form1.control}
                    name="api_hash"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground uppercase">API Hash</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              placeholder="0123456789abcdef0123456789abcdef" 
                              className="pl-9 font-mono bg-background/50 border-white/10 focus-visible:ring-primary/50" 
                              data-testid="input-api-hash"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form1.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground uppercase">Phone Number</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              placeholder="+1234567890" 
                              className="pl-9 font-mono bg-background/50 border-white/10 focus-visible:ring-primary/50" 
                              data-testid="input-phone"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                        <FormDescription className="text-xs">
                          Get your credentials at <a href="https://my.telegram.org" target="_blank" rel="noreferrer" className="text-primary hover:underline">my.telegram.org</a>
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full font-mono font-medium tracking-wide bg-primary text-primary-foreground hover:bg-primary/90 glow-border"
                    disabled={startSession.isPending}
                    data-testid="button-submit-credentials"
                  >
                    {startSession.isPending ? "CONNECTING..." : "GENERATE OTP"}
                  </Button>
                </form>
              </Form>
            )}

            {/* STEP 2: OTP */}
            {step === 2 && (
              <Form {...form2}>
                <form onSubmit={form2.handleSubmit(onStep2Submit)} className="space-y-4">
                  {verifySession.error && (
                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{(verifySession.error as any)?.error || "Invalid code"}</AlertDescription>
                    </Alert>
                  )}
                  
                  <FormField
                    control={form2.control}
                    name="phone_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground uppercase">Login Code</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="12345" 
                            className="font-mono text-center tracking-widest text-lg bg-background/50 border-white/10 focus-visible:ring-primary/50" 
                            data-testid="input-code"
                            autoComplete="off"
                            {...field} 
                          />
                        </FormControl>
                        <FormDescription className="text-xs text-center">
                          Check your Telegram app for the official service message.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setStep(1)}
                      className="flex-1 font-mono border-white/10 hover:bg-white/5"
                    >
                      BACK
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-[2] font-mono bg-primary text-primary-foreground hover:bg-primary/90 glow-border"
                      disabled={verifySession.isPending}
                      data-testid="button-verify-code"
                    >
                      {verifySession.isPending ? "VERIFYING..." : "VERIFY CODE"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}

            {/* STEP 3: 2FA */}
            {step === 3 && (
              <Form {...form3}>
                <form onSubmit={form3.handleSubmit(onStep3Submit)} className="space-y-4">
                  {verify2FA.error && (
                    <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{(verify2FA.error as any)?.error || "Invalid password"}</AlertDescription>
                    </Alert>
                  )}
                  
                  <FormField
                    control={form3.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs text-muted-foreground uppercase">Cloud Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input 
                              type="password" 
                              placeholder="••••••••" 
                              className="pl-9 font-mono bg-background/50 border-white/10 focus-visible:ring-primary/50" 
                              data-testid="input-password"
                              {...field} 
                            />
                          </div>
                        </FormControl>
                        {hint && <FormDescription className="text-xs">Hint: {hint}</FormDescription>}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="flex gap-3 pt-2">
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setStep(1)}
                      className="flex-1 font-mono border-white/10 hover:bg-white/5"
                    >
                      ABORT
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-[2] font-mono bg-primary text-primary-foreground hover:bg-primary/90 glow-border"
                      disabled={verify2FA.isPending}
                      data-testid="button-verify-password"
                    >
                      {verify2FA.isPending ? "UNLOCKING..." : "UNLOCK"}
                    </Button>
                  </div>
                </form>
              </Form>
            )}

            {/* STEP 4: RESULT */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="p-4 rounded-md bg-black/40 border border-white/10 relative group">
                  <div className="absolute top-2 right-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs font-mono border border-white/10 hover:bg-white/10 hover:text-white"
                      onClick={copyToClipboard}
                      data-testid="button-copy-session"
                    >
                      {copied ? <CheckCircle2 className="h-4 w-4 text-green-400 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                      {copied ? "COPIED" : "COPY"}
                    </Button>
                  </div>
                  <label className="font-mono text-xs text-muted-foreground uppercase mb-2 block">String Session</label>
                  <div className="overflow-x-auto pb-2">
                    <code className="text-xs text-primary font-mono break-all whitespace-pre-wrap select-all block mt-2">
                      {stringSession}
                    </code>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-xs text-muted-foreground uppercase">Usage (Python)</label>
                  <div className="p-4 rounded-md bg-[#0d1117] border border-white/10 text-xs font-mono overflow-x-auto text-gray-300">
                    <pre>
<span className="text-purple-400">from</span> pyrogram <span className="text-purple-400">import</span> Client{'\n'}
{'\n'}
app = Client({'\n'}
    <span className="text-green-400">"my_account"</span>,{'\n'}
    session_string=<span className="text-green-400">"{stringSession.substring(0, 10)}..."</span>{'\n'}
){'\n'}
{'\n'}
<span className="text-purple-400">with</span> app:{'\n'}
    app.send_message(<span className="text-green-400">"me"</span>, <span className="text-green-400">"Session generated!"</span>)
                    </pre>
                  </div>
                </div>

                <Button 
                  onClick={startOver} 
                  variant="outline" 
                  className="w-full font-mono border-white/10 hover:bg-white/5"
                  data-testid="button-start-over"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  START OVER
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
