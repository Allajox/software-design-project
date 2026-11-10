package model;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * Hash y verificación de contraseñas con PBKDF2-HMAC-SHA256 (solo JDK, sin Spring).
 *
 * Formato almacenado: {@code pbkdf2-sha256$<iteraciones>$<sal en Base64>$<hash en Base64>}, el mismo que genera el
 * login simulado del frontend (core/usuarios), así que sus hashes de demostración verifican aquí tal cual.
 */
public class PasswordHasher {

    private static final String PREFIJO = "pbkdf2-sha256";
    private static final SecureRandom AZAR = new SecureRandom();

    private final int iteraciones;
    private final String hashFalso;

    /** @param iteraciones costo de los hashes NUEVOS (OWASP recomienda 600 000); los ya guardados conservan el suyo. */
    public PasswordHasher(int iteraciones) {
        if (iteraciones < 1_000) {
            throw new IllegalArgumentException("Iteraciones insuficientes: " + iteraciones);
        }
        this.iteraciones = iteraciones;
        // hash de una contraseña que nadie conoce: sirve para gastar el mismo tiempo cuando el correo no existe
        this.hashFalso = hash("no-existe-" + AZAR.nextLong());
    }

    public final String hash(String contrasena) {
        byte[] sal = new byte[16];
        AZAR.nextBytes(sal);
        return PREFIJO + "$" + iteraciones + "$" + Base64.getEncoder().encodeToString(sal) + "$"
                + Base64.getEncoder().encodeToString(derivar(contrasena, sal, iteraciones, 32));
    }

    /** true solo si la contraseña corresponde al hash. Un hash mal formado da false (nunca lanza). */
    public boolean verify(String contrasena, String almacenado) {
        if (contrasena == null || almacenado == null) {
            return false;
        }
        String[] partes = almacenado.split("\\$", -1);
        if (partes.length != 4 || !PREFIJO.equals(partes[0])) {
            return false;
        }
        try {
            byte[] esperado = Base64.getDecoder().decode(partes[3]);
            byte[] calculado = derivar(contrasena, Base64.getDecoder().decode(partes[2]), Integer.parseInt(partes[1]),
                    esperado.length);
            return MessageDigest.isEqual(calculado, esperado); // tiempo constante
        } catch (IllegalArgumentException e) { // base64 o número mal formado
            return false;
        }
    }

    /** Hash válido de una contraseña inexistente, para verificar algo aunque el correo no exista. */
    public String hashFalso() {
        return hashFalso;
    }

    private static byte[] derivar(String contrasena, byte[] sal, int vueltas, int bytes) {
        PBEKeySpec especificacion = new PBEKeySpec(contrasena.toCharArray(), sal, vueltas, bytes * 8);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(especificacion).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2-HMAC-SHA256 no está disponible en esta JVM.", e);
        } finally {
            especificacion.clearPassword();
        }
    }
}
