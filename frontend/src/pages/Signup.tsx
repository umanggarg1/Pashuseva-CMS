import { Link, Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useCurrentUser } from '@/lib/auth';
import { apiFetch, ApiError, assetUrl } from '@/lib/api';

const signupSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    phone: z.string().min(1, 'Phone number is required'),
    email: z.string().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Needs a letter')
      .regex(/[0-9]/, 'Needs a number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function Signup() {
  const { data: currentUser, isPending: isLoadingUser } = useCurrentUser();

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', phone: '', email: '', password: '', confirmPassword: '' },
  });

  const signup = useMutation({
    mutationFn: (values: z.infer<typeof signupSchema>) =>
      apiFetch('/auth/signup', { method: 'POST', body: JSON.stringify(values) }),
  });

  if (!isLoadingUser && currentUser) {
    return <Navigate to="/" replace />;
  }

  const errorMessage =
    signup.error instanceof ApiError
      ? signup.error.message
      : signup.error
        ? 'Something went wrong. Try again.'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-sm"
      >
        <Card>
          {signup.isSuccess ? (
            <CardContent className="space-y-3 py-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
              <h1 className="text-lg font-semibold">Request received</h1>
              <p className="text-sm text-muted-foreground">
                If that email isn&apos;t already registered, your account has been created
                and is waiting for approval from an administrator. If you already have an
                account, try logging in instead.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Back to Login</Link>
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader className="items-center text-center">
                <img
                  src={assetUrl('/public/uploads/store/Pashuseva logo light.jpeg')}
                  alt="Pashuseva"
                  className="mb-2 h-16 w-16 rounded-full object-cover"
                />
                <h1 className="text-xl font-semibold">Create your account</h1>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((v) => signup.mutate(v))}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input type="tel" autoComplete="tel" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {errorMessage && (
                      <p className="text-sm font-medium text-destructive">{errorMessage}</p>
                    )}

                    <Button type="submit" className="w-full" disabled={signup.isPending}>
                      {signup.isPending ? 'Creating account…' : 'Create Account'}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{' '}
                      <Link to="/login" className="text-primary hover:underline">
                        Login
                      </Link>
                    </p>
                  </form>
                </Form>
              </CardContent>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
