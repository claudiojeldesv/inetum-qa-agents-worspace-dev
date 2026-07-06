package saucedemo;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * Suite legacy de login (2019). Mantenida a mano desde entonces.
 * NOTA equipo QA: no tocar los sleeps, sin ellos falla en el Jenkins viejo.
 */
public class LoginTests {

    private WebDriver driver;

    @Before
    public void setUp() {
        driver = new ChromeDriver();
        driver.get("https://www.saucedemo.com/");
    }

    @After
    public void tearDown() {
        driver.quit();
    }

    @Test
    public void testValidLogin() throws InterruptedException {
        driver.findElement(By.xpath("//*[@id=\"user-name\"]")).sendKeys("standard_user");
        driver.findElement(By.xpath("//*[@id=\"password\"]")).sendKeys("secret_sauce");
        driver.findElement(By.xpath("/html/body/div/div/div[2]/div[1]/div/div/form/input")).click();
        Thread.sleep(3000);
        assertTrue(driver.getCurrentUrl().contains("inventory.html"));
        assertEquals("PRODUCTS",
            driver.findElement(By.xpath("//*[@id=\"header_container\"]/div[2]/span")).getText().toUpperCase());
    }

    @Test
    public void testLockedOutUser() throws InterruptedException {
        driver.findElement(By.id("user-name")).sendKeys("locked_out_user");
        driver.findElement(By.id("password")).sendKeys("secret_sauce");
        driver.findElement(By.id("login-button")).click();
        Thread.sleep(2000);
        String error = driver.findElement(By.xpath("//h3[@data-test='error']")).getText();
        assertTrue(error.contains("locked out"));
    }

    @Test
    public void testProblemUserCanReachInventory() throws InterruptedException {
        // Copia de testValidLogin con otro usuario (2020, ticket QA-1432)
        driver.findElement(By.xpath("//*[@id=\"user-name\"]")).sendKeys("problem_user");
        driver.findElement(By.xpath("//*[@id=\"password\"]")).sendKeys("secret_sauce");
        driver.findElement(By.xpath("/html/body/div/div/div[2]/div[1]/div/div/form/input")).click();
        Thread.sleep(3000);
        assertTrue(driver.getCurrentUrl().contains("inventory.html"));
        assertEquals("PRODUCTS",
            driver.findElement(By.xpath("//*[@id=\"header_container\"]/div[2]/span")).getText().toUpperCase());
    }
}
